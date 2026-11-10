<?php
/**
 * Copyright © 2026 Blue Fairy Development. All rights reserved.
 */
declare(strict_types=1);

namespace BlueFairy\LayeredNavigationHyva\Test\Unit\Package;

use PHPUnit\Framework\TestCase;

/**
 * Package-level facts a merchant and the release depend on.
 *
 * @coversNothing
 */
class PackageTest extends TestCase
{
    private const ROOT = __DIR__ . '/../../..';

    /**
     * The base module's source, wherever this package is being tested from.
     */
    private function basePath(string $file): string
    {
        foreach ([dirname((string) realpath(self::ROOT)) . '/module-layered-navigation', (string) getenv('MAGENTO_ROOT') . '/vendor/bluefairy/module-layered-navigation'] as $root) {
            if (is_file($root . '/' . $file)) {
                return $root . '/' . $file;
            }
        }
        self::fail('The base module is not beside this package nor installed: ' . $file);
    }

    public function testManifestAndRegistrationAgree(): void
    {
        $composer = json_decode((string) file_get_contents(self::ROOT . '/composer.json'), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('bluefairy/module-layered-navigation-hyva', $composer['name']);
        self::assertSame(['MIT'], $composer['license']);
        self::assertSame('^1.0', $composer['require']['bluefairy/module-layered-navigation']);
        self::assertArrayHasKey('hyva-themes/magento2-theme-module', $composer['require']);
        self::assertStringContainsString("'BlueFairy_LayeredNavigationHyva'", (string) file_get_contents(self::ROOT . '/registration.php'));
        $module = (string) file_get_contents(self::ROOT . '/etc/module.xml');
        self::assertStringContainsString('name="BlueFairy_LayeredNavigationHyva"', $module);
        self::assertStringContainsString('<module name="BlueFairy_LayeredNavigation"/>', $module);
        self::assertStringContainsString('<module name="Hyva_Theme"/>', $module);
        self::assertStringContainsString('MIT License', (string) file_get_contents(self::ROOT . '/LICENSE.txt'));
    }

    public function testTheArchiveLeavesOutDevelopmentTooling(): void
    {
        $attributes = (string) file_get_contents(self::ROOT . '/.gitattributes');
        foreach (['Test/', 'phpunit.xml.dist', 'phpcs.xml.dist', 'phpstan.neon.dist', '.gitattributes'] as $path) {
            self::assertMatchesRegularExpression('#^' . preg_quote($path, '#') . '\s+export-ignore#m', $attributes, $path);
        }
    }

    public function testTheLayoutsApplyToHyvaThemesOnlyAndPointAtBlocksTheBaseModuleDeclares(): void
    {
        $layouts = glob(self::ROOT . '/view/frontend/layout/*.xml');
        self::assertCount(2, $layouts);
        foreach ($layouts as $layout) {
            $name = basename($layout, '.xml');
            self::assertStringStartsWith('hyva_', $name, 'a layout without the prefix would change Luma store views too');
            $baseLayout = (string) file_get_contents($this->basePath('view/frontend/layout/' . substr($name, 5) . '.xml'));
            $xml = (string) file_get_contents($layout);
            preg_match_all('/<referenceBlock name="([^"]+)"/', $xml, $m);
            self::assertSame(['bluefairy.layerednav.products.start'], $m[1]);
            self::assertStringContainsString('name="bluefairy.layerednav.products.start"', $baseLayout);
            self::assertStringContainsString('template="BlueFairy_LayeredNavigationHyva::marker/start.phtml"', $xml);
            self::assertStringContainsString('<css src="BlueFairy_LayeredNavigationHyva::css/bfln.css"/>', $xml);
        }
    }

    public function testEveryClassTheNavigationUsesIsStyled(): void
    {
        $css = (string) file_get_contents(self::ROOT . '/view/frontend/web/css/bfln.css');
        preg_match_all('/\.(bfln[a-z-]*|is-[a-z]+)\b/', $css, $defined);
        $defined = array_flip($defined[1]);

        $used = [];
        foreach (['view/frontend/templates/layer/view.phtml', 'view/frontend/templates/marker/end.phtml', 'view/frontend/web/js/bfln-core.js'] as $file) {
            $source = (string) file_get_contents($this->basePath($file));
            preg_match_all('/class="([^"<]*)/', $source, $attributes);
            foreach ($attributes[1] as $attribute) {
                foreach (preg_split('/\s+/', trim($attribute)) as $class) {
                    if (preg_match('/^bfln(-[a-z]+)*$/', $class) === 1) {
                        $used[$class] = $file;
                    }
                }
            }
            preg_match_all("/'(bfln-[a-z-]+|is-[a-z]+)'/", $source, $literals);
            foreach ($literals[1] as $class) {
                $used[$class] = $file;
            }
        }
        // Built from the filter type in the template: bfln-filter-<type>. Only swatch has a look of its own.
        unset($used['bfln-filter-'], $used['bfln-nav'], $used['bfln-products-start'], $used['bfln-products-end'], $used['bfln-status']);
        $used['bfln-status'] = 'end.phtml';

        self::assertGreaterThan(30, count($used), 'the scan found the classes the navigation uses');
        $unstyled = array_keys(array_diff_key($used, $defined));
        // Classes that mark state or position and need no rule of their own.
        $unstyled = array_values(array_diff($unstyled, ['bfln-option', 'is-all', 'bfln-busy']));
        self::assertSame([], $unstyled, 'classes the navigation uses that the Hyva stylesheet does not style');
    }

    public function testTheStartUpTemplateIsSafeUnderAStrictContentSecurityPolicy(): void
    {
        $template = (string) file_get_contents(self::ROOT . '/view/frontend/templates/marker/start.phtml');
        self::assertSame(1, substr_count($template, '$hyvaCsp->registerInlineScript()'), 'the inline script is registered');
        self::assertSame(1, preg_match_all('/<script>/', $template), 'and it is the only inline script');
        self::assertSame(0, preg_match_all('/\son[a-z]+="|x-data|@click|x-on:|:class=/', $template), 'no inline handlers or Alpine expressions');
        self::assertSame(0, preg_match_all('/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\()/', $template));
        self::assertStringContainsString("getViewFileUrl('BlueFairy_LayeredNavigation::js/bfln-core.js')", $template);
        self::assertStringContainsString('id="bfln-products-start"', $template, 'the marker the shared script looks for');
        self::assertStringContainsString('class="bfln-marker-start"', $template);
        self::assertSame(0, preg_match_all('/<\?=\s*(?!\$escaper->escape|\$config\[\'ajax\'\] \? |\$inlineAllowed \? )/', $template), 'every output is escaped or a fixed literal');
        self::assertFileExists($this->basePath('view/frontend/web/js/bfln-core.js'));
    }

    public function testTheSharedScriptOffersTheHooksTheTemplateUses(): void
    {
        $core = (string) file_get_contents($this->basePath('view/frontend/web/js/bfln-core.js'));
        $template = (string) file_get_contents(self::ROOT . '/view/frontend/templates/marker/start.phtml');
        foreach (['accept', 'onUpdated', 'ajax'] as $option) {
            self::assertStringContainsString('options.' . $option, $core, $option);
            self::assertMatchesRegularExpression('/\b' . $option . ':/', $template, $option);
        }
        self::assertStringContainsString('root.BflnCore = factory()', $core, 'the script is usable without a module loader');
    }

    public function testEveryPhpFileDeclaresStrictTypesAndCarriesNoTicketKey(): void
    {
        $files = [self::ROOT . '/registration.php', self::ROOT . '/view/frontend/templates/marker/start.phtml'];
        foreach ($files as $path) {
            $source = (string) file_get_contents($path);
            self::assertMatchesRegularExpression('/^declare\(strict_types=1\);$/m', $source, $path);
            self::assertSame(0, preg_match('/\b[A-Z][A-Z0-9]+-\d+\b/', $source), $path);
        }
    }
}
