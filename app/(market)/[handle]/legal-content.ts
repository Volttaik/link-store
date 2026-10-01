export const LEGAL_PAGES: Record<string, { title: string; intro: string; sections: Array<{ heading: string; text: string }> }> = {
  privacy: {
    title: "Privacy Policy", intro: "How Rush Cart handles information when you discover products, buy from independent stores or manage your shop.",
    sections: [
      { heading: "Information we use", text: "We process account details, email addresses, profile information, sign-in and security records, messages, uploaded images, shopping carts, orders and delivery details. Sellers also provide store information and payout details. We use these to operate your account, process purchases, support conversations, prevent misuse and maintain order records." },
      { heading: "Purchases and conversations", text: "The seller receives the customer and delivery details needed to fulfil an order. Conversation participants can read the messages they exchange. Public store and product information is visible to visitors. Keep private information out of public descriptions and images." },
      { heading: "Providers", text: "Paystack processes payments; Rush Cart does not ask you to send card details in messages. Resend delivers account and transactional emails. Hosting, data and media providers process information needed to operate the platform. Google sign-in, when available, shares identity information with Rush Cart after you choose it." },
      { heading: "Usage and storage", text: "Rush Cart records storefront and purchase activity for seller reporting and platform operation. Necessary cookies maintain sign-in, cart and order access. Your theme and privacy preferences are saved on your device. No optional advertising or third-party analytics trackers are currently loaded. See Cookie information for controls." },
      { heading: "Retention and your choices", text: "You can edit available account settings and contact the seller about an order. You may request access, correction or deletion through support; transaction, security or dispute records may need to be retained where applicable. Deleting a message from your view does not necessarily delete another participant's copy. Do not assume a particular retention period or instant deletion of all records." },
      { heading: "Security and contact", text: "Access to account and seller tools requires authentication. No online system can guarantee absolute security. Report concerns through the Contact & Support page. Requests are reviewed in light of the relevant account and applicable requirements." },
    ],
  },
  terms: {
    title: "Terms of Service", intro: "These terms describe the core responsibilities of buyers and independent sellers using Rush Cart.",
    sections: [
      { heading: "Your account", text: "Provide accurate information, protect your password and verification codes, and use only accounts and stores you are authorised to manage. Normal accounts can shop and message; creating a workspace enables seller tools. Do not impersonate others or attempt to access another person's information." },
      { heading: "Products and Events", text: "Sellers are responsible for accurate descriptions, prices, availability, product rights and lawful fulfilment. Events are curated collections of existing products, not admission tickets or attendance bookings. Do not list illegal, unsafe, counterfeit or misleading products." },
      { heading: "Payments and negotiated orders", text: "Checkout and supported chat payment requests are processed through Paystack. Review the product, seller, amount and delivery arrangement before paying. A request in a conversation does not charge you until you choose to pay. Only confirmed payments create paid status. Payment availability depends on supported currencies and the seller's setup." },
      { heading: "Delivery, returns and disputes", text: "Independent sellers fulfil purchases and report shipment progress. Review the seller's published policies and agree arrangements before buying. Contact the seller from your order or conversation about delays, returns or refunds, and contact support if you cannot resolve a platform issue. Refund timing depends on the payment provider and bank. Nothing here removes rights that applicable law grants you." },
      { heading: "Seller fees and payouts", text: "Platform fees and recorded earnings appear in seller finance tools. Sellers must review the applicable fee configuration and payout information before trading. A payout request is not a completed transfer; processing can require review." },
      { heading: "Acceptable use", text: "Do not send spam, harassment or deceptive payment requests, manipulate payment status, misuse personal data or interfere with the platform. Access may be restricted to protect users and investigate misuse. Availability and uninterrupted service are not guaranteed." },
      { heading: "Questions", text: "Use Contact & Support for platform concerns and the seller's conversation for purchase-specific questions. These terms describe the current platform. Applicable consumer and privacy rights continue to apply." },
    ],
  },
  cookies: {
    title: "Cookie information", intro: "Compact controls for the storage Rush Cart needs and the optional technologies it does not currently load.",
    sections: [
      { heading: "Strictly necessary", text: "Session cookies keep you signed in and support security checks. Cart cookies identify a basket, and order-access cookies support access to purchase details. These are necessary to provide the corresponding functionality and are not disabled by rejecting optional storage. Signing out clears account and shopping access cookies; the account's own cart remains associated with that account on the server." },
      { heading: "Preferences", text: "Your device remembers the selected colour theme and the privacy choice you save. Use Privacy preferences on any page to change your choice. If device storage is blocked, Rush Cart cannot persist that preference and may ask again." },
      { heading: "Optional analytics and advertising", text: "No optional advertising or third-party analytics trackers are currently loaded. Seller reporting uses platform activity records, not a third-party advertising cookie. An optional preference does not enable any tracker today; any future optional technology must respect your choice and its disclosed purpose." },
      { heading: "Browser controls", text: "You can clear or block cookies and saved preferences in your browser. Blocking necessary cookies can prevent sign-in or cart features from working. Browser notification permission is separate from cookie choices and can be revoked in browser settings." },
    ],
  },
  faq: {
    title: "Frequently asked questions", intro: "Discover products, shop independent stores and manage your own shop.",
    sections: [
      { heading: "Do I need a workspace to buy?", text: "No. A normal account can buy, message sellers and view its orders. Create a workspace only when you want to sell." },
      { heading: "What is an Event?", text: "An Event is a product collection or campaign, such as a new drop or seasonal sale. It links products from the seller's store. Removing a product from a collection does not delete the product." },
      { heading: "How do I negotiate?", text: "Open a product and choose Message Seller. Discuss the product in the conversation. Where supported, the seller can send a payment request for the agreed amount. Review it before paying." },
      { heading: "Where is my receipt?", text: "Open Your orders to find order details and payment status. Paid orders can receive a confirmation by email. If it does not arrive, check your email address and ask the seller to resend it. A failed email does not reverse a confirmed payment." },
      { heading: "Payment failed or still processing?", text: "Do not pay repeatedly while a transaction is pending. Reopen the order or payment request to check its verified status. Contact your bank about any unexpected debit and discuss the order with the seller." },
      { heading: "How do I manage categories?", text: "Use Products in your workspace menu and choose a category. The creation flow starts with that category selected. You can still change it when editing." },
      { heading: "Can I get browser notifications?", text: "Supported browsers can show new-message notifications after you enable them. Permission is requested only when you choose it. Notifications currently require Rush Cart to be open; background push delivery is not available." },
    ],
  },
  support: {
    title: "Contact & Support", intro: "Get help with a purchase, your account or your store.",
    sections: [
      { heading: "Purchase questions", text: "Open Your orders or the product/store page and message the seller. Include your order reference and a clear description of the problem. Never share passwords, verification codes or full payment-card details." },
      { heading: "Account and privacy requests", text: "Use the monitored Reply-To address in an official Rush Cart email when one is configured. If no support address is shown, contact the platform operator through the channel where you were invited to Rush Cart. If email support is unavailable, your seller conversation remains the purchase-specific contact channel." },
      { heading: "Payment concerns", text: "Check the order's verified payment status first. For a bank debit that does not match a confirmed order, retain the payment reference for the payment provider and contact the seller. Rush Cart will never ask you to pay a support fee through a private message." },
    ],
  },
};
