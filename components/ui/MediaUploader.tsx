"use client";

import { Button, Chip, ProgressBar } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { IMAGE_ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "@/lib/uploads";

export type UploadedImage = { url: string; key: string | null; alt?: string | null };

type UploadResponse = {
  key: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  error?: string;
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

type UploadOptions = {
  kind: "image" | "file";
  folder: string;
  visibility?: "public" | "private";
  /** `avatar` stores under the user; everything else is a store asset. */
  purpose?: "store" | "avatar" | "message";
};

/** What `/api/uploads/sign` answers. */
type SignResponse = {
  direct: boolean;
  uploadUrl?: string;
  key?: string;
  url?: string;
  contentType?: string;
  error?: string;
};

/** The server refused the upload outright — its reason is the answer. */
class UploadRefused extends Error {}

/** PUT the bytes straight to R2, with progress. */
function putDirect(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    // The content type is a signed header: R2 rejects the body if it does not
    // match what this server validated.
    request.setRequestHeader("Content-Type", contentType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The upload could not be completed. Please try again."));
    };
    request.onerror = () =>
      reject(new Error("The upload was interrupted. Check your connection and try again."));
    request.send(file);
  });
}

/** Send the file through the application server — the pre-R2 / fallback pipe. */
function streamThroughServer(
  file: File,
  options: UploadOptions,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", options.kind);
  body.append("folder", options.folder);
  if (options.visibility) body.append("visibility", options.visibility);
  if (options.purpose) body.append("purpose", options.purpose);

  // XMLHttpRequest (rather than fetch) so genuine upload progress is available.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      try {
        const parsed = JSON.parse(request.responseText) as UploadResponse;
        if (request.status >= 200 && request.status < 300) resolve(parsed);
        else reject(new Error(parsed.error ?? "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    };

    request.onerror = () =>
      reject(new Error("The upload was interrupted. Check your connection and try again."));
    request.send(body);
  });
}

/**
 * Upload one file.
 *
 * The file goes **directly to Cloudflare R2** when the server hands back a
 * presigned URL, so the bytes never pass through the application server. The
 * server still authorizes the request and decides the object key, so this is a
 * change of pipe, not of trust.
 *
 * If no signed URL is available — R2 is not configured, signing failed, or the
 * direct PUT itself did not land (a missing bucket CORS rule, say) — the file
 * falls back through `/api/uploads`, which is the same validation and the same
 * key layout. An upload therefore never fails merely because the direct path
 * is unavailable.
 */
async function upload(
  file: File,
  options: UploadOptions,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  let signed:
    | { uploadUrl: string; key: string; url: string; contentType: string }
    | null = null;

  try {
    const response = await fetch("/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        kind: options.kind,
        folder: options.folder,
        visibility: options.visibility,
        purpose: options.purpose,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as SignResponse;
      if (data.direct && data.uploadUrl && data.key) {
        signed = {
          uploadUrl: data.uploadUrl,
          key: data.key,
          url: data.url ?? "",
          contentType: data.contentType || file.type,
        };
      }
    } else if ([400, 401, 413].includes(response.status)) {
      // A deliberate refusal (type, size, permission): repeating it through the
      // streaming route would only fail again. The reason is the answer.
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new UploadRefused(body?.error ?? "Upload failed.");
    }
    // Any other failure asking for a signed URL is not fatal — fall through.
  } catch (error) {
    if (error instanceof UploadRefused) throw error;
  }

  if (signed) {
    try {
      await putDirect(signed.uploadUrl, file, signed.contentType, onProgress);
      return {
        key: signed.key,
        url: signed.url,
        fileName: file.name,
        contentType: signed.contentType,
        size: file.size,
      };
    } catch {
      // The direct path did not land — the streaming path still can.
    }
  }

  return streamThroughServer(file, options, onProgress);
}

/** Multiple image uploader with reordering by removal and re-selection. */
export function ImageUploader({
  value,
  onChange,
  folder,
  max = 8,
}: {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  folder: string;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const remaining = max - value.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${max} images.`);
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    const uploaded: UploadedImage[] = [];

    for (const file of selected) {
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`${file.name} is larger than 8 MB.`);
        continue;
      }

      try {
        setProgress(0);
        const result = await upload(
          file,
          { kind: "image", folder, visibility: "public" },
          setProgress,
        );
        uploaded.push({ url: result.url, key: result.key, alt: file.name });
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    }

    if (uploaded.length > 0) onChange([...value, ...uploaded]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {value.map((image, index) => (
          <div key={`${image.url}-${index}`} className="relative">
            <img
              alt={image.alt ?? ""} className="h-24 w-24 rounded-xl object-cover"
              src={image.url}
            />
            <Button
              isIconOnly
              aria-label="Remove image"
              className="absolute -top-2 -right-2"
              size="sm"
              variant="danger"
              onPress={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Icon name="x" />
            </Button>
            {index === 0 ? (
              <Chip className="absolute bottom-1 left-1 text-xs" size="sm" variant="primary">
                Cover
              </Chip>
            ) : null}
          </div>
        ))}

        {value.length < max ? (
          <Button
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 border border-dashed border-border text-muted"
            variant="ghost"
            onPress={() => inputRef.current?.click()}
          >
            {progress === null ? (
              <>
                <Icon name="plus" size={18} />
                <span className="text-xs">Add image</span>
              </>
            ) : (
              <OrbLoader className="h-3.5 w-[2.6rem]" />
            )}
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef} type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        multiple className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {progress !== null ? (
        <ProgressBar aria-label="Upload progress" size="sm" value={progress}>
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <p className="text-xs text-muted">
        JPEG, PNG, WebP, AVIF or GIF · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB each ·
        the first image is the cover.
      </p>
    </div>
  );
}

/** Single image uploader (profile picture, logo, banner, event cover). */
export function SingleImageUploader({
  value,
  onChange,
  folder,
  label = "Upload image",
  purpose = "store",
  fit = "cover",
  previewClassName = "h-16 w-16",
}: {
  value: string | null;
  onChange: (image: UploadedImage | null) => void;
  folder: string;
  label?: string;
  purpose?: "store" | "avatar";
  /**
   * How the preview frames the image. `contain` keeps the whole image at its
   * own proportions inside the frame with room to breathe — logos and marks,
   * never stretched, cropped or clipped. `cover` fills the frame the way a
   * cover region does on the storefront.
   */
  fit?: "contain" | "cover";
  /** Size/shape of the preview frame. Covers read best in a wide frame. */
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const result = await upload(
        file,
        { kind: "image", folder, visibility: "public", purpose },
        () => {},
      );
      onChange({ url: result.url, key: result.key, alt: file.name });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <img
            alt=""
            src={value}
            className={`${previewClassName} rounded-xl ${
              fit === "contain" ? "object-contain p-2" : "object-cover"
            }`}
          />
        ) : (
          <div
            className={`flex ${previewClassName} items-center justify-center rounded-md border border-dashed border-border text-muted`}
          >
            –
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="secondary" isPending={busy}
            onPress={() => inputRef.current?.click()}
          >
            {value ? "Replace" : label}
          </Button>
          {value ? (
            <Button size="sm" variant="danger-soft" onPress={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef} type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE} className="hidden"
        onChange={(event) => void handleFile(event.target.files)}
      />

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <p className="text-xs text-muted">
        JPEG, PNG, WebP, AVIF or GIF · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.
      </p>
    </div>
  );
}

/** Private digital-product file uploader. */
export function DigitalFileUploader({
  folder,
  onUploaded,
}: {
  folder: string;
  /** Called once the file is safely in storage, so the caller can attach it. */
  onUploaded?: (uploaded: UploadResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const uploaded = await upload(
        file,
        { kind: "file", folder, visibility: "private" },
        () => {},
      );
      setResult(uploaded);
      onUploaded?.(uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" isPending={busy}
          onPress={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
        <span className="text-xs text-muted">
          PDF, ZIP, EPUB, audio, video or documents · up to{" "}
          {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB
        </span>
      </div>

      <input ref={inputRef} type="file" className="hidden" onChange={(event) => void handleFile(event.target.files)} />

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {result ? (
        <div className="rounded-xl bg-surface-secondary/50 p-2 text-xs">
          <p className="font-medium">{result.fileName}</p>
          <p className="text-muted">{formatSize(result.size)} · uploaded</p>
          <p className="mt-1 text-muted">Click “Attach file” to attach it to this product.</p>
        </div>
      ) : null}
    </div>
  );
}
