import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const index=read('public/index.html');
const app=read('public/app.js');
const css=read('public/v54.css');
const acceptance=read('public/v54-acceptance.css');
const js=read('public/v54.js');
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(index.includes('viewport-fit=cover'),'viewport-fit=cover missing');
expect(index.indexOf('./v54.css')>index.indexOf('./v53.css'),'v54.css must load after v53.css');
expect(index.indexOf('./v54-acceptance.css')>index.indexOf('./v54.css'),'v54-acceptance.css must load after v54.css');
expect(index.indexOf('./v54.js')>index.indexOf('./v53.js'),'v54.js must load after v53.js');

expect(css.includes('body.studio-v54 .global-links{')&&css.includes('display:flex!important'),'mobile primary nav restore missing');
expect(css.includes('position:fixed!important')&&css.includes('bottom:0!important'),'mobile bottom nav rail missing');
expect(css.includes('env(safe-area-inset-bottom,0px)'),'safe-area bottom inset missing');
expect(css.includes('height:100dvh!important'),'full-height mobile drawer rule missing');
expect(css.includes('body.studio-v54 .period-popover{')&&css.includes('position:fixed!important'),'mobile period sheet rule missing');
expect(css.includes('overflow-x:auto!important'),'internal horizontal scrolling missing');

expect(acceptance.includes('body.studio-v54 .section-status{')&&acceptance.includes('display:flex!important'),'mobile Compare/View controls not restored');
expect(acceptance.includes('.freshness')&&acceptance.includes('.grain-chip{display:none!important}'),'low-priority mobile status chips not suppressed');
expect(acceptance.includes('min-width:720px!important'),'readable mobile table intrinsic width missing');

expect(app.includes('class="chart-xlabel"'),'V4.14 HTML chart X labels missing from chart renderer');
expect(app.includes('class="chart-xlabels"'),'V4.14 HTML chart X label layer missing');
expect(!app.includes('<text class="chart-xlabel"'),'chart X labels regressed into SVG text');
expect(js.includes("if(width<=340) return 4")&&js.includes("if(width<=430) return 5")&&js.includes("if(width<=620) return 6"),'viewport-aware chart label density missing');
expect(js.includes("keep.add(Math.round(i*(labels.length-1)/(limit-1)))"),'chart label sampling missing');
expect(js.includes("#periodPopover")&&js.includes("#viewPopover"),'mobile overlay lock does not cover period/view overlays');

const navItems=(index.match(/class="nav-item/g)||[]).length;
expect(navItems===9,`expected 9 primary nav items, found ${navItems}`);
expect(index.includes('id="compareToggle"'),'Compare control missing');
expect(index.includes('id="viewMenuBtn"'),'View Settings control missing');
expect(index.includes('id="importDrawer"'),'Import drawer missing');
expect(index.includes('id="commandPalette"'),'Command palette missing');
expect(index.includes('id="detailDrawer"'),'Detail drawer missing');
expect(index.includes('id="panelModal"'),'Panel modal missing');

if(failures.length){
  console.error('MOBILE RESPONSIVE STATIC CHECK FAILED');
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('MOBILE RESPONSIVE STATIC CHECK PASS');
