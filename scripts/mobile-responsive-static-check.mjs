import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const index=read('public/index.html');
const app=read('public/app.js');
const css=read('public/v54.css');
const acceptance=read('public/v54-acceptance.css');
const js=read('public/v54.js');
const browserAcceptance=read('scripts/mobile-responsive-acceptance.mjs');
const pkg=JSON.parse(read('package.json'));
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

function blockAfter(source,marker){
  const start=source.indexOf(marker);
  if(start<0) return '';
  const open=source.indexOf('{',start);
  if(open<0) return '';
  let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'){
      depth--;
      if(depth===0) return source.slice(open+1,i);
    }
  }
  return '';
}
const hasAll=(source,...parts)=>parts.every(part=>source.includes(part));

expect(index.includes('viewport-fit=cover'),'viewport-fit=cover missing');
expect(index.indexOf('./v54.css')>index.indexOf('./v53.css'),'v54.css must load after v53.css');
expect(index.indexOf('./v54-acceptance.css')>index.indexOf('./v54.css'),'v54-acceptance.css must load after v54.css');
expect(index.indexOf('./v54.js')>index.indexOf('./v53.js'),'v54.js must load after v53.js');

const mobileMediaMarker='@media(max-width:860px){';
const mobileMediaIndex=css.indexOf(mobileMediaMarker);
const mobileCss=blockAfter(css,mobileMediaMarker);
const firstTableRuleIndex=css.indexOf('body.studio-v54 .table-wrap{');
expect(mobileMediaIndex>=0&&mobileCss,'primary mobile media block missing');
expect(!css.slice(0,mobileMediaIndex).includes('body.studio-v54'),'desktop DOM overrides detected before mobile breakpoint');
expect(firstTableRuleIndex>mobileMediaIndex,'table hardening must remain mobile-only for desktop no-op');
expect(!css.includes('@media(min-width:861px)'),'explicit >860 V4.15 styling violates desktop no-op');
expect(mobileCss.includes('body.studio-v54 .chart-xlabels{min-width:0}'),'chart label helper must stay inside mobile breakpoint');

const mobileNavRule=blockAfter(mobileCss,'body.studio-v54 .global-links{');
expect(hasAll(mobileNavRule,'display:flex!important','position:fixed!important','bottom:0!important','overflow-x:auto!important'),'mobile primary nav restore/fixed-scroll contract missing from .global-links rule');
expect(mobileCss.includes('env(safe-area-inset-bottom,0px)'),'safe-area bottom inset missing from mobile shell');
const mobileDrawerRule=blockAfter(mobileCss,'body.studio-v54 .import-drawer,');
expect(hasAll(mobileDrawerRule,'height:100dvh!important','max-height:100dvh!important'),'full-height mobile drawer rule missing from drawer selector block');
const mobilePeriodRule=blockAfter(mobileCss,'body.studio-v54 .period-popover{');
expect(hasAll(mobilePeriodRule,'position:fixed!important','overflow-y:auto!important'),'mobile Period sheet must be fixed and internally scrollable');
const mobileTableRule=blockAfter(mobileCss,'body.studio-v54 .table-wrap{');
expect(mobileTableRule.includes('overflow-x:auto!important'),'table viewport must own horizontal scrolling inside mobile media');

const compactMobileMarker='@media(max-width:860px) and (max-height:520px) and (orientation:landscape){';
expect(css.includes(compactMobileMarker),'compact landscape shell must stay inside mobile breakpoint');
expect(!css.includes('@media(max-width:960px) and (max-height:520px) and (orientation:landscape){\n  :root'),'932px landscape must not inherit mobile shell heights');
const drawerHeaderRule=blockAfter(mobileCss,'body.studio-v54 .drawer-head,');
expect(drawerHeaderRule.includes('padding:calc(16px + var(--v54-safe-top))'),'drawer/detail headers must preserve top safe-area inset in their own rule');
const drawerFooterRule=blockAfter(mobileCss,'body.studio-v54 .drawer-foot{');
expect(drawerFooterRule.includes('calc(12px + var(--v54-safe-bottom))'),'Import footer must preserve Home Indicator safe-area inset in its own rule');

const acceptanceMobile=blockAfter(acceptance,'@media(max-width:860px){');
expect(acceptanceMobile,'acceptance mobile media block missing');
const sectionStatusRule=blockAfter(acceptanceMobile,'body.studio-v54 .section-status{');
expect(sectionStatusRule.includes('display:flex!important'),'mobile Compare/View controls not restored in section-status rule');
expect(acceptanceMobile.includes('.freshness')&&acceptanceMobile.includes('.grain-chip{display:none!important}'),'low-priority mobile status chips not suppressed');
const readableTableRule=blockAfter(acceptanceMobile,'body.studio-v54 .table-wrap>.data-table{');
expect(readableTableRule.includes('min-width:720px!important'),'readable mobile table intrinsic width missing from table rule');
const periodWrapperRule=blockAfter(acceptanceMobile,'html body.studio-v54 .global-nav .global-nav-inner .global-actions>.period-control{');
expect(hasAll(periodWrapperRule,'display:block!important','width:44px!important','height:44px!important'),'mobile Period wrapper restore/touch contract missing from scoped rule');
const mobileGlobalNavRule=blockAfter(acceptanceMobile,'body.studio-v54 .global-nav{');
expect(hasAll(mobileGlobalNavRule,'backdrop-filter:none!important','-webkit-backdrop-filter:none!important','background:rgba(250,250,252,.97)!important'),'mobile Period fixed-containing-block/readability fix missing from global-nav rule');
const viewRule=blockAfter(acceptanceMobile,'body.studio-v54 .view-popover{');
expect(hasAll(viewRule,'var(--v54-safe-top) - var(--v54-safe-bottom) - 20px','overflow-y:auto!important'),'View popover safe-area/internal-scroll protection missing from scoped rule');
const narrowAcceptance=blockAfter(acceptance,'@media(max-width:340px){');
const narrowTouchRule=blockAfter(narrowAcceptance,'body.studio-v54 .search-command,');
expect(hasAll(narrowTouchRule,'width:44px!important','height:44px!important'),'narrow-phone global actions must remain 44px in <=340 acceptance override');

const lowHeightAcceptance=blockAfter(acceptance,'@media(max-width:960px) and (max-height:520px) and (orientation:landscape){');
expect(lowHeightAcceptance,'<=960 low-height protection block missing');
expect(!lowHeightAcceptance.includes(':root')&&!lowHeightAcceptance.includes('.global-nav')&&!lowHeightAcceptance.includes('.global-links')&&!lowHeightAcceptance.includes('.section-nav'),'932px low-height acceptance block must not inherit mobile shell sizing/navigation rules');

expect(app.includes('class="chart-xlabel"'),'V4.14 HTML chart X labels missing from chart renderer');
expect(app.includes('class="chart-xlabels"'),'V4.14 HTML chart X label layer missing');
expect(!app.includes('<text class="chart-xlabel"'),'chart X labels regressed into SVG text');
expect(js.includes("if(width<=340) return 4")&&js.includes("if(width<=430) return 5")&&js.includes("if(width<=620) return 6"),'viewport-aware chart label density missing');
expect(js.includes("keep.add(Math.round(i*(labels.length-1)/(limit-1)))"),'chart label sampling missing');
expect(js.includes("#periodPopover")&&js.includes("#viewPopover"),'mobile overlay lock does not cover period/view overlays');

expect(pkg.devDependencies?.['playwright-core']==='1.62.1','playwright-core acceptance version must be pinned to 1.62.1');
expect(pkg.scripts?.['check:mobile:static']==='node scripts/mobile-responsive-static-check.mjs','check:mobile:static package script missing');
expect(pkg.scripts?.['check:mobile']==='node scripts/mobile-responsive-acceptance.mjs','check:mobile package script missing');
expect(browserAcceptance.includes("from 'playwright-core'"),'browser acceptance must use playwright-core');
expect(browserAcceptance.includes('CHROMIUM_PATH')&&browserAcceptance.includes('executablePath'),'browser acceptance system Chromium resolution missing');
expect(!browserAcceptance.includes("from 'playwright'"),'bundled Playwright dependency reintroduced');

for(const viewport of ['mobile-320x568','mobile-360x800','mobile-375x667','mobile-390x844','mobile-393x852','mobile-430x932','tablet-768x1024','tablet-820x1180','landscape-844x390','landscape-932x430','desktop-1440x900','desktop-1920x1080']){
  expect(browserAcceptance.includes(`['${viewport}'`),`browser acceptance viewport missing: ${viewport}`);
}
expect(browserAcceptance.includes('const deviceLike=mobile||compactLandscape'),'mobile/tablet/landscape browser-device classification missing');
expect(browserAcceptance.includes('isMobile:deviceLike,hasTouch:deviceLike'),'tablet/landscape touch emulation missing');
expect(!browserAcceptance.includes("['desktop-1440x900',1440,900,true]")&&!browserAcceptance.includes("['desktop-1920x1080',1920,1080,true]"),'desktop acceptance must not be hard-coded as touch');
expect(browserAcceptance.includes('const overlayAcceptance=true'),'all 12 viewports must execute overlay interaction acceptance, including desktop regression widths');
expect(browserAcceptance.includes('innerWidth,innerHeight'),'browser acceptance must capture actual viewport dimensions');
expect(browserAcceptance.includes('actual viewport width')&&browserAcceptance.includes('actual viewport height'),'browser acceptance must reject viewport emulation drift');
expect(browserAcceptance.includes('body overflow after navigating'),'browser acceptance must guard both document and body overflow after page switches');
expect(browserAcceptance.includes("page.locator('#refreshBtn').click()")&&browserAcceptance.includes('Refresh confirmation text missing'),'Refresh click contract coverage missing');
expect(browserAcceptance.includes('required data table missing'),'required Ads/Products/Charges/Inventory/Returns tables must fail closed when absent');
expect(browserAcceptance.includes('narrow-phone table has no real internal horizontal scroll range'),'narrow-phone table acceptance must prove a real internal scroll range');
expect(browserAcceptance.includes('Quick current-period action missing')&&browserAcceptance.includes('Month period tab missing')&&browserAcceptance.includes('Custom period tab missing'),'Quick/Month/Custom Period coverage must fail closed when controls are absent');
expect(browserAcceptance.includes('importInternals')&&browserAcceptance.includes('bodyOverflowY')&&browserAcceptance.includes('footInside')&&browserAcceptance.includes('dropInside'),'Import internal-scroll/footer/dropzone acceptance missing');
expect(browserAcceptance.includes("rect(page,'#commandResults')")&&browserAcceptance.includes('command results do not own vertical scrolling'),'Command results internal-scroll acceptance missing');
expect(browserAcceptance.includes('command input did not accept search text'),'Command input functional acceptance missing');
expect(browserAcceptance.includes("rect(page,'#detailBody')")&&browserAcceptance.includes('detail drawer body does not own vertical scrolling'),'Detail body internal-scroll acceptance missing');
expect(browserAcceptance.includes("rect(page,'#panelModalBody')")&&browserAcceptance.includes('panel modal body does not own vertical scrolling'),'Panel body internal-scroll acceptance missing');
expect(browserAcceptance.includes('mobile view popover does not own vertical scrolling'),'View Settings internal-scroll acceptance missing');
expect(browserAcceptance.includes('finalOverflow'),'final post-interaction document/body overflow gate missing');
expect(!browserAcceptance.includes('#commitBtn'),'non-destructive acceptance must never reference or invoke Import Commit');

const navItems=(index.match(/class="nav-item/g)||[]).length;
expect(navItems===9,`expected 9 primary nav items, found ${navItems}`);
expect(index.includes('id="compareToggle"'),'Compare control missing');
expect(index.includes('id="viewMenuBtn"'),'View Settings control missing');
expect(index.includes('id="periodButton"'),'Period control missing');
expect(index.includes('id="commandButton"'),'Search control missing');
expect(index.includes('id="refreshBtn"'),'Refresh control missing');
expect(index.includes('id="topImportBtn"'),'Import control missing');
expect(index.includes('id="importDrawer"'),'Import drawer missing');
expect(index.includes('id="commandPalette"'),'Command palette missing');
expect(index.includes('id="detailDrawer"'),'Detail drawer missing');
expect(index.includes('id="panelModal"'),'Panel modal missing');
expect(index.includes('id="commitBtn"'),'Import Commit control missing from product DOM; acceptance must leave it untouched');

if(failures.length){
  console.error('MOBILE RESPONSIVE STATIC CHECK FAILED');
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('MOBILE RESPONSIVE STATIC CHECK PASS');
