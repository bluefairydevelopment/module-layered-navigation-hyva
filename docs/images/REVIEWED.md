# Shipped images: reviewed record

Every image in `docs/images/` is pinned here by SHA-256. `Test/Unit/Package/ShippedImagesAreReviewedTest`
fails on any image added, changed or removed until this table is updated. A test cannot read a
picture; it can refuse to ship bytes nobody has attested to. Each image below was opened and looked
at, at full size, before its row was written.

Captured 2026-11-10 on the m249 test rig (Magento 2.4.9) by `capture-LayeredNavigation-images.js`, against a wholly SYNTHETIC catalogue: 24 drawn products, invented category, brand and attribute names, no customer, no order. The rig's cookie banner and chat button (other products) are hidden by the capture, and the frame holds no host name, admin user name or address bar.

| File | Bytes | SHA-256 | Reviewed note |
|------|-------|---------|---------------|
| `storefront-multi-select.png` | 92172 | `844fcbef093c0deb…` | HYVA (default-csp theme) category page, cropped to the columns: Red and Blue ticked, "Now Shopping By" with both and Clear All, the navigation in the companion stylesheet, product cards with Add to Cart, wish list and compare buttons; drawn tees named by colour and material with prices. |
| `storefront-navigation.png` | 33137 | `36e72d0e5b857449…` | HYVA, the navigation alone with Size M chosen: price slider 40 to 80, colour swatches with counts, size text swatches with M selected, six brand checkboxes, material as one-at-a-time options. |
| `storefront-price-slider.png` | 5554 | `051af543c65ba43f…` | HYVA, the price filter alone: two handles, the fields 34 and 94, the Apply button. |
| `storefront-show-more.png` | 17970 | `51832b5894039804…` | HYVA, the brand filter after "Show more": twelve invented brand names each with a count of 2, and the "Show less" link. |
