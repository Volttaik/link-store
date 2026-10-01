import { Icon, type IconName } from "@/components/ui/Icon";

const FEATURES: Array<{ label: string; icon: IconName }> = [
  { label: "Easy Navigation", icon: "categories" },
  { label: "Easy Product Discovery", icon: "search" },
  { label: "Easy Payment", icon: "creditCard" },
  { label: "Easy Checkout", icon: "cart" },
];

export function RushFeatureCube() {
  return <div className="rush-cube-scene relative flex min-w-0 flex-col items-center justify-center">
    <p className="sr-only">Rush Cart: Easy Navigation, Easy Product Discovery, Easy Payment, Easy Checkout.</p>
    <div className="rush-cube-stage" aria-hidden="true"><div className="rush-cube-tilt"><div className="rush-cube">
      {FEATURES.map((feature, index) => <div key={feature.label} className={`rush-cube-face rush-cube-face-${index}`}>
        <span className="rush-cube-brand">Rush Cart</span><span className="rush-cube-icon"><Icon name={feature.icon} size={28} /></span><span className="rush-cube-label">{feature.label}</span><span className="rush-cube-line" />
      </div>)}
      <div className="rush-cube-cap rush-cube-bottom" />
    </div></div></div>
  </div>;
}
