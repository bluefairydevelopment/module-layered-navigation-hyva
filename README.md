# BlueFairy Layered Navigation for Hyvä

Makes BlueFairy Layered Navigation work on Hyvä themes: the same filters, multi-select, price
slider, swatches, filter addresses and no-reload updates, without RequireJS or Knockout.

| | |
|---|---|
| Package | `bluefairy/module-layered-navigation-hyva` |
| Module | `BlueFairy_LayeredNavigationHyva` |
| Requires | `bluefairy/module-layered-navigation` 1.0 or later, Hyvä Theme module 1.5 or later |
| Magento | Magento Open Source 2.4.8 and 2.4.9 |
| PHP | 8.3, 8.4, 8.5 |
| Licence | MIT |

## Install

The package comes from the same Private Packagist repository as
`bluefairy/module-layered-navigation`. Set the repository and your credentials up first, as that
package's README describes under "Add the Private Packagist repository".

```bash
composer require bluefairy/module-layered-navigation-hyva
bin/magento module:enable BlueFairy_LayeredNavigationHyva
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy -f
bin/magento cache:flush
```

There is nothing to configure. Every setting, filter setting and filter address of BlueFairy
Layered Navigation applies to the Hyvä storefront as it does to Luma.

You do not need to rebuild the theme's Tailwind stylesheet: the module ships its own small
stylesheet and loads it on category and search result pages only.

## What it changes

Only on store views that use a Hyvä theme:

- The navigation starts from a plain script instead of RequireJS.
- The navigation gets its stylesheet, `css/bfln.css`.

On Luma store views of the same installation the module does nothing.

## Colours

The stylesheet reads its colours from CSS custom properties. Set them in your theme to match it:

```css
.bfln {
    --bfln-accent: #0f766e;   /* ticked boxes, links, slider handles */
    --bfln-border: #e5e7eb;
    --bfln-text: #111827;
    --bfln-muted: #6b7280;
    --bfln-surface: #fff;
}
```

## Content security policy

The module works with Hyvä's strict content security policy (the CSP theme). Its one inline
script is registered with Hyvä's CSP view model, and the navigation uses no inline event handlers.

When a filtered product list arrives with a script the page is not already running, and the
store's policy does not allow starting it, the page is loaded the ordinary way instead of being
updated in place. The shopper sees the same result with a page load.

## Uninstall

```bash
bin/magento module:uninstall BlueFairy_LayeredNavigationHyva
```

The module stores nothing of its own.

## Support

support@bluefairydevelopment.com
