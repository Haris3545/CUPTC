/* Padel Pong — camera + static scene.
 * The court is ray-cast pixel by pixel (SNES "Mode 7" style) into low-res canvases
 * once per resize, so every line and wall stays perfectly crisp. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});

  // Real padel dimensions (metres). Net at z = 0, the player's half is z < 0.
  const COURT = { hw: 5, hl: 10, service: 6.95, net: 0.88, netSide: 0.92 };
  PP.COURT = COURT;
  PP.sideWallHeight = (z) => (Math.abs(z) >= 8 ? 4 : 3);

  const C = {
    court: [104, 160, 137], courtGrain: [95, 150, 128], courtEdge: [60, 110, 90],
    line: [246, 249, 255],
    apron: [31, 64, 52], apronGrain: [27, 57, 46],
    grass1: [245, 241, 233], grass2: [233, 227, 215], grassMid: [239, 234, 224],
    glass: [255, 255, 255], frame: [22, 44, 36], frameHi: [60, 100, 84], mesh: [22, 44, 36],
    netMesh: [22, 44, 36], tape: [255, 255, 255], post: [22, 44, 36],
    sil: [62, 112, 90], silHi: [104, 156, 134], lit: [255, 255, 255], far: [150, 194, 175], farHi: [186, 216, 202],
    trees: [44, 86, 69], treesHi: [79, 128, 105],
    stand: [236, 232, 224], standBack: [31, 64, 52], step: [255, 255, 255], seat: [133, 180, 160],
    board: [223, 35, 38], boardTop: [22, 44, 36], boardText: [255, 255, 255], millBoard: [255, 255, 255], millText: [22, 22, 20]
  };
  const CROWD_SHIRT = [[255, 255, 255], [223, 35, 38], [133, 180, 160], [31, 64, 52], [255, 255, 255], [223, 35, 38]];
  const CROWD_SKIN = [[243, 193, 155], [226, 163, 118], [182, 118, 80], [128, 82, 56]];
  const CROWD_HAIR = [[42, 29, 22], [107, 62, 38], [26, 28, 44], [230, 190, 110]];
  const SKYLINE = { w: 736, h: 174 };
  const SKYLINE_BITS = Uint8Array.from(atob('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADnwQcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDjAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4B8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAIAAAAAAAAAAAAAAAAAwAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAABwAAAAAAAAAAAAAAAADABwAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAHAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAcAAAAAAAAAAAAAAAAAwAcAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAABwAAAAAAAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAHAAAAAAAAAAAAAAAAAMAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAcAAAAAAAAAAAAAAAAAwA8AAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAABwAAAAAAAAAAAAAAAADADwAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAPAAAAAAAAAAAAAAAAAMAPAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AEAAAAAgA8AAAAAAAAAAAAAAAAA4A8AAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AwAAAADAHwAAAAAAAAAAAAAAAADgDwAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgDAAAAAMA/AAAAAAAAAAAAAAAAAOAPAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/AcAAAAA4D8AAAAAAAAAAAAAAAAA4A8AAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAADAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8BwAAAADgPwAAAAAAAAAAAAAAAADgDwAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAMAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwPAAAAAPA/AAAAAAAAAAAAAAAAAOAfAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAwAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQAAAAAAAAAAAAAA/A8AAAAA8H8AAAAAAAAAAAAAAAAA4B8AAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAAADAAQwAAAAAAAAAAAAAAAAADAAAAAAAAOAfAOAPAAAAAAAAAAAAAAD8DwAAAADwfwAAAAAAAAAAAAAAAADwHwAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAAMABHAAAAAAAAAAAAAAAAAAPAAAAAAAA8B8A8B8AAAAAAAAAAAAAAPwPAAAAAOA/AAAAAAAAAAAAAAAAAPAfAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAAAAAA4AMeAAAAAAAAAAAAAAAAgAcAAAAAAADwHwDwHwAAAAAAAAAAAAAA/A8AAAAA4D8AAAAAAAAAAAAAAAAA8B8AAAAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAAADgAx4AAAAAAAAAAAAAAACAAwAAAAAAAPAfAPAfAAAAAAAAAAAAAAD8DwAAAADgPwAAAAAAAAAAAAAAAADwHwAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAAAAAOADHgAAAAAAAAAAAAAAAMABAMABAAAA8B8A8B8AAAAAAAAAAAAAAPwPAAAAAOB/AAAAAAAAAAAAAAAAAPAfAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAAAA4AMeAAAAAAAAAAAAAAAA8AEAHwAAAADwHwDwHwAAAAAAAAAAAAAA/g8AAAAA4H8AAAAAAAAAAAAAAAAA8B8AAAAAAAAAAMA/AAAAAAAAAAAAAAAAAAAAAAAAAADgAx4AAAAAAAAAAAAAAAD4A4AfAAAAAPAfAPAfAAAAAAAAAAAAAAD+DwAAAADwfwAAAAAAAAAAAAAAAADwPwAAAAAAAACAwX8wAAAAAAAAAAAAAAAAAAAAAAAAAOADHgAAAAAAAAAAAAAAAJwD4A8AAAAA8B8A8B8AAAAAAAAAAAAAAP4fAAAAAPB/AAAAAAAAAAAAAAAAAPA/AAAAAAAAAMDBf3AAAAAAAAAAAAAAAAAAAAAAAAAA4AMeAAAAAAAAAAAAAAAADAAAAAAAAADwHwDwHwAAAAAAAAAAAAAA/x8AAAAA+P8AAAAAAAAAAAAAAAAA8D8AAAAAAAAA4MF/eAAAAAAAAAAAAAAAAAAAAAAAAADgAx4AAAAAAAAAAAAAAAAEAAAAAAAAAPA/APA/AAAAAAAAAAAAAAD/HwAAAAD4/wAAAAAAAAAAAAAAAADwPwAAAAAAAADg4X94AAAAAAAAAAAAAAAAAAAAAAAAAOADHgAAAAAAAAAAAAAAAAQAAAAAAAAA8D8A+D8AAAAAAAAAAAAAAP8fAAAAAPj/AAAAAAAAAAAAAAAAAPg/AAAAAAADAODj/3gAAAAAAAAAAAAAAAAAAAAAAAAA4AMeAAAAAAAAAAAAAAAAAAAAAAAAAADwfxP/PwAAAAAAAAAAAAAA/x8AAAAA+P8AAAAAAAAAAAAAAAAA+D8AAAAAAAcAwOP/eAAAAAAAAAAAAAAAAAAAAAAAAADgAx4AAADAAAAAAAAAAAAAAAAAAAAAAPD/+/8/AAAAAAAAAAAAAAD/HwAAAAD4/wAAAAAAAAAAAAAAAAD4PwAAAAAAHwDA4/94AAAAAAAAAAAAAAAAAAAAAAAAAOADHgAAAPwPAAAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAAAAAPj/AAAAAAAAAAAAAAAAAPg/AAAAAAB+AMD3/3wAAAAAAAAAAAAAAAAAAAAAAAAA4P8fAAAA/B8AAAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8AAAAA+P8AAAAAAAAAAAAAAAAA+D8AAAAAAP4A4Pf/fAAAAAAAAAAAAAAAAAAAAAAAAADg/x8AAAD+PwAAAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwAAAAD4/wAAAAAAAAAAAAAAAAD4PwAAAAAA/gPg9///AAAAAAAAAAAAAAAAAAAAAAAAAOD/HwAAAP9/AAAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAAAAAPj/AAAAAAAAAAAAAAAAAPg/AAAAAAD+B+D///8AAAAAAAAAAAAAAAAAAAAAAAAA4P8fAACA//8AAAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8AAAAA+P8AAAAAAAAAAAAAAAAA+D8AAAAAAP4H4P///wAAAAAAAAAAAAAAAAAAAAAAAADg/x8AAMD//wEAAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwAAAAD4/wAAAAAAAAAAAAAAAAD8fwAAAAAA/wfw////AAAAAAAAAAAAAAAAAAAAAAAAAOD/HwAA4P//AQAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAAAAAPj/AAAAAAAAAAAAAAAAAPx/AAAAAAD/B/D///8AAAAAAAAAAAAAAAAAAAAAAAAA4P8fAADw//8DAAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8AAAAA+P8AAAAAAAAAAAYAAAAA/H8AAAAAAPgD8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AAPj//wcAAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwAAAAD4/wAAAAAAAAAADgAAAAD8fwAAAAAA8APw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwAA+P//DwAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAAAAAPj/AAAADgAAAAAOAAAAAPx/AAAAAACAA/D///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAAD8//8fAAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8AAAEA+P8AAAAOAAAAAA4AAAAA/H8AAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AAP7//x8AAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwCAAQD4/wgAAA4AAAAADgAAAAD8fwAAAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwAA/v//PwAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAMADAPj/CAAADgAAAAAOAAAAAPz/AAAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAAD+//8/AAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8AwAEA+P8IBAAOAAAAAA8AAAAA/P8AAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AAP7//z8AAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwCAAAD4/wgEAA4AAAAAHwAAAAD+/wAAAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwAA/v//PwAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fAMfhAPj/DAYADwAAAIA/AAAAAP7/AAAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAAD///8/AAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8Ax+MA+P8MBoMfAAAAgD8AAAAA/v8AAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AAP///z8AAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/HwD//wD4/xwGgz8AAACAPwAAAAD+/wAAAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwAA////fwAAAAAAAAAAAAAAAAAA8P///z8AAAAAAAAAAAAAAP8fDP//MPj/HAaDPwAAAIA/AAAAAP7/AAAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAADw////PwAAAAAAAAAAAAAA/x8e//95+P8eBsM/AAAAgD8AAAAA/v8AAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAPD///8/AAAAAAAAAAAAAAD/P77//3/8/x8Gwz8AAACAPwAAAAD+/wAAAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA+P///z8AAAAAAAAAAAAAAP8//v//P/z/HwbDPwAAAIA/AAAAAP7/AAAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD4////PwAAAAAAAAAAAAAA/3/+//9//P8fD8M/CAAAgD8AAAAA/v8AAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAPz///9/AAAAAAAAAAAAAAD/f////////x8Pwz8IAADAfwAAAAD//wAAAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP//////////Hw/DPwgAAMB/AAAAAP//AQAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA//////////8fj8N/CAEA4H8AAAAA//8PAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD//////////x+Pw38IAQDgfwAAAAD//w8AAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP//////////H4/nfwwhAOB/AAAAAP//DwAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA//////////8/j+d/DCME4H8AAACA//8fAAAAAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD///////////+P538MYwTgfwAAAID//x8AAAAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP///////////5/nfwxjhOB/AAAAgP//HwAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA/////////////+d/HGOE4H8AAACA//8fAAAwAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD/////////////738eY4zwfwAAAID//x8AADgAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP//////////////fx5jjPB/AAAAgP//HwAAOAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA//////////////9/nmOM8X8AAADA//8/AAAwAAAA8P///wEAAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD///////////////+eY4zx/wAAAID//z8AADAAAADw////AQAAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP///////////////573jPH/AAAAgP//fwAAMQABAPD///8BAAAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA////////////////n/eM8f8AAACA//9/AAD///////////8DAAAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD///////////////+/947x/wAAAID//38AgP///////////wcAAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP/////////////////3nPH/AAAAgP//PwCA////////////DwAAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA///////////////////e8f8AAADo//8/AMD///////////8PAgAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD//////////////////9/7/wAAAP7//z8AwP///////////x8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP//////////////////3/v/AAAA/v//PwDg////////////PwMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA////////////////////+/8AAAD+//8/AOD/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD//////////////////////wAAAP///z8A4P////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8AAAAAAAAAAAAAAP//////////////////////AAAA////PwDw/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD+/////wAAAAAAAAAAAAAA//////////////////////8AAAD+//8/APD/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP7/////AAAAAAAAAAAAAAD//////////////////////wAAAP7//z8A+P////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAAAA/v////8BAAAAAAAAAAAAAP//////////////////////AAAA/v//PwD4/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAAD//////wEAAAAAAAAAAAAA//////////////////////8AAAD+//8/APz/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAAP//////AQAAAAAAAAAAAAD//////////////////////wAAAP7//38A/P////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAACA//////8DAAAAAAAAAAAAAP//////////////////////AAAA/v//fwD8/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAID//////wMAAAAAAAAAAAAA//////////////////////8AAAD+//9/AP7/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAgP//////AwAAAAAAAAAAAAD//////////////////////wAAAP7//38A/v////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAACA//////8DAAAAAAAAAAAAAP//////////////////////AAAA/v//fwD4/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAID//////wMAAAAAAAAAAAAA//////////////////////8AAAD+//8/APD/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAgP//////AwAAAAAAAAAAAAD//////////////////////wAAAP7//z8A8P////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAACA//////8DAAAAAAAAAAAAAP//////////////////////AAAA/v//PwDw/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAID//////wMAAAAAAAAAAAAA//////////////////////8AAAD+//8/APD/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAgP//////AwAAAAAAAAAAAAD//////////////////////wAAAP7//z8A8P////////////8DAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAACA//////8DAAAAAAAAAAAAAP//////////////////////AAAA/v//PwDw/////////////wMAAAAAAAAAAAAAAAAAAAAA4P8fAID/////AAAAAAAAAAAAAAAAAID//////wMAAAAAAAAAAAAA//////////////////////8AAAD+//8/APD/////////////AwAAAAAAAAAAAAAAAAAAAADg/x8AgP////8AAAAAAAAAAAAAAAAAgP//////AwAAAAAAAAAAAAD//////////////////////wAAAP///z8A8P////////////8HAAAAAAAAAAAAAAAAAAAAAOD/HwCA/////wAAAAAAAAAAAAAAAACA//////8DAAAAAAAAAAAAAP//////////////////////AAAA////PwDw/////////////wcAAAAAAAAAAAAAAAAAAAAA4P8f+O///////////////////wMAAID//////wMAAAAAAAAAAAAA//////////////////////8AAID///8/APD/////////////DwAAAAAAAAAAAAAAAAAAAADg/x/+////////////////////BwAAgP//////AwAAAAAAAAAAAAD//////////////////////wAAgP///z8A8P////////////8fAAAAAAAAAAAAAAAAAAAAAOD/H/7///////////////////8HAACA//////8DAAAAAAAAAAAAAP//////////////////////AACH////fwDw/////////////x8AAAAAAAAAAAAAAAAAAPD///8f/v///////////////////w8AAID//////wMAAAAAAAAAAAAA//////////////////////8ADo////9/APD/////////////PwAAAAAAAAAAAAAAAAAA8P///x/+////////////////////DwAAgP//////AwAAAAAAAAAAAAD//////////////////////wCPv////38A8P////////////8/AAAAAAAAAAAAAAAAAADw////H/7///////////////////8PABCA//////8DIAAAAAAAAAAAAP//////////////////////AM///////wDw/////////////z8AAAAAAAAAAAAAAAAAAPD///8f/v///////////////////x8AEID//////wMwAAAAAAAAAAAA//////////////////////8Az///////APD/////////////PwAAAAAAAAAAAAAA+P///////x/+////////////////////HwAQgP//////AzAAAAAAAAAAAAD//////////////////////wD///////8A8P////////////9/AAAAAAAAAAAAAAD4////////H/7///////////////////8fABiA//////8DcAAAAAAAAAAAAP//////////////////////AP///////wDw/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////x+AvYP//////wN7BwAAAAAAAAAA//////////////////////8A////////APD/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////P8b/9///////n//PAAAAAAAAAAD//////////////////////wD///////8A8P////////////9/AAAAAAAAAAAAAAD4////////H/7///////////////////8f//////////////8BAAAAAAAAAP//////////////////////AP///////wDw/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////w///////////////wEAAAAAAAAA//////////////////////8A////////APD/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////B///////////////AQAAAAAAAAD//////////////////////wD///////8A8P////////////9/AAAAAAAAAAAAAAD4////////H/7///////////////////8H//////////////8BAAAAAAAAAP//////////////////////AP///////wDw/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////wf//////////////wEAAAAAAAAA//////////////////////8A////////AfD/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////B///////////////AQAAAAAAAAD//////////////////////4D///////8D8P////////////9/AAAAAAAAAAAAAAD4////////H/7///////////////////8H//////////////8BAAAAAAAAAP//////////////////////gP///////wPw/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////wf//////////////wEAAAAAAAAA///////////////////////A////////B/D/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////h///////////////AwAAAAAAAAD//////////////////////8D///////8H8P////////////9/AAAAAAAAAAAAAAD4////////H/7////////////////////H//////////////8HAAAAAAAAAP//////////////////////4P///////w/w/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////8f//////////////w8AAAAAAAAA///////////////////////g////////H/D/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////x///////////////DwAAAAAAAAD///////////////////////D///////8f8P////////////9/AAAAAAAAAAAAAAD4////////H/7////////////////////H//////////////8PAAAAAAAAAP//////////////////////+P///////z/w/////////////38AAAAAAAAAAAAAAPj///////8f/v///////////////////8f//////////////w8AAAAAAAAA///////////////////////4////////P/D/////////////fwAAAAAAAAAAAAAA+P///////x/+////////////////////x///////////////DwAAAAAAAAD///////////////////////z///////9/8P////////////9/AAAAAAAAAAAAAAD4////////H/7////////////////////H//////////////8PAAAAAAAAAP//////////////////////+P///////3/w/////////////z8AAAAAAAAAAAAAAPj///////8f/v///////////////////8f//////////////w8AAAAAAAAA///////////////////////w//////////D/////////////PwAAAAAAAAAAAAAA+P///////x/+////////////////////x///////////////DwAAAAAAAAD///////////////////////D/////////8P////////////8fAAAAAAAAAAAAAAD4////////H/7////////////////////H//////////////8PAAAAAAAAAP//////////////////////8P/////////w/////////////x8AAAAAAAAAAAAAAPj///////8f/v///////////////////8f//////////////w8AAAAAAAAA///////////////////////w//////////D/////////////DwAAAAAAAAAAAAAA+P///////x/+////////////////////x///////////////DwAAAAAAAAD///////////////////////D/////////8P////////////8HAAAAAAAAAAAAAAD4////////H/7////////////////////H//////////////8PAAAAAAAABP//////////////////////8P/////////w/////////////wcAAAAAAAAAAAAAAPj///////8f/v///////////////////8f//////////////w8AAABAAAAE///////////////////////w//////////D/////////////AwAAAAAAAAAAAAAA+P///////x/+////////////////////x///////////////DwMAIGAAAI7///////////////////////D/////////8P////////////8DAAAAAAAAAAAAAAD4////////H/7////////////////////H////////////////////////////////////////////////8P/////////w/////////////wMAAAAAAAAAAAAAAPj///////8f/v///////////////////8f////////////////////////////////////////////////w//////////D/////////////AwAAAAAAAAAAAAAA+P///////x/+////////////////////x/////////////////////////////////////////////////D/////////8P////////////8DAAAAAAAAAAAAAAD4////////H/7////////////////////H////////////////////////////////////////////////8P/////////w/////////////wMAAAAAAAAAAAAAAPj///////8f/v///////////////////8f////////////////////////////////////////////////w//////////D/////////////AwAAAAAAAAAAAAAA+P///////x/+////////////////////x/////////////////////////////////////////////////D/////////8P////////////8DAAAAAAAAAAAAAAD4////////H/7////////////////////H////////////////Pzx48OHB////////////////////////8P/////////w/////////////wMAAAAAAAAAAAAAAPj///////8f/v///////////////////8f///////////////8fGHjgwYH////////////////////////w//////////D/////////////AwAAAAAAAAAAAAAA+P///////x/+////////////////////x////////////////x8YeODAgf////////////////////////D/////////8P////////////8DAAAAAAAAAAAAAAD4////////H/7////////////////////H////////////////Hxh44MCB////////////////////////8P/////////4/////////////wMAAAAAAAAAAAAAAPj///////8f/v///////////////////8f///////////////8fGHjgwIH/////////////////////////////////////////////////BwAAAAAAAAAAAAAA+P///////x/+////////////////////x////////////////x8YeODAgf////////////////////////////////////////////////8fAAAAAAAAAAAAAAD4////////H/7////////////////////H////////////////Hxh44MGB//////////////////////////////////////////////////8BAAAAAAAAAAAAAPz///////8///////////////////////////////////////8fOP//x4H//////////////////////////////////////////////////wcAAAAAAAAAAAAA/////////////////////////////////////////////////x/8////gf//////////////////////////////////////////////////HwAAAAAAAAAAAPD/////////////////////////////////////////////////////////////////////////////////////////////////////////////AQAAAAAAAAAA/v////////////////////////////////////////////////////////////////////////////////////////////////////////////8HAAAAAAAAAOD//////////////////////////////////////////////////////////////////////////////////////////////////////////////z8AAAAAAAAA/P////////////////////////////////////////////////////8PAP///////////////////////////////////////////////////////wEAAAAAAMD//////////////////////////////////////////////////////wAA+P//////////////////////////////////////////////////////BwAAAAAA/P////////////////////////////////////////////////////8fAADA//////////////////////////////////////////////////////9/AAAAAAD//////////////////////////////////////////////////////w8AAAD///////////////////////////////////////////////////////8BAAAA8P//////////////////////////////////////////////////////AwAAAPz//////////////////////////////////////////////////////w8AAAD///////////////////////////////////////////////////////8AAAAA+P//////////////////////////////////////////////////////fwAA4P//////////////////////////////////////////////////////fwAAAADg////////////////////////////////////////////////////////AQD+//////////////////////////////////////////////////////8/AAAAAMD///////////////////////////////////////////////////////8PAP7//////////////////////////////////////////////////////x8AAAAAgP///////////////////////////////////////////////////////w8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='), (ch) => ch.charCodeAt(0));
  const MILL_TEX = { w: 320, h: 113 };
  const MILL_BITS = Uint8Array.from(atob('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIMAAQAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgDAAAAAAcAAAA4AAAAABgCAAAAQBAAAAAAAAAAAAAAAAAAAAAAAAD+HwAAAPAHAACAPwAAAAAAADAADAAYAAAAAAAAAAAAAAAAAAAAAAAA/x8AAAD8BwAA4D8AAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAgP9/AACA/wcAAPw/AAAAACeAAQCAAJABAAAAAAAAAAAAAAAAAAAAAMD/fwAA+P8HAMD/PwAAAIABEAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg//8AAP//BwD4/z8AAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//AcD//wcA/v8/AAAAAAAGAAAAMIABAAAAAAAAAAAAAAAAAAAAAOD//wH4//8HgP//PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw//8B/P//B8D//z8AAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAA8P//AfD//weA//8/AAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAPD//wHA//8HAP//PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw//8BgP//BwD8/z8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//AQD//wcA+P8/AAAAIAAAAHgAAAACAAAAAAAAAAAAAAAAAAAAAOD//wAA/v8HAPD/PwAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAADA/38AAP7/BwDw/z8AAAAQBAAAeAAAEAwAAAAAAAAAAAAAAAAAAAAAwP9/AAD+/wcA8P8/AAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAID/PwAA/v8HAPD/PwAAAAABAAB4AABAEAAAAAAAAAAAAAAAAAAAAAAA/x8AAP7/BwDw/z8AAAAEAPAAeAAAABAAAAAAAAAAAAAAAAAAAAAAAP4PAAD+/wcA8P8/AAAABADwAXgACAAQAAAAAAAAAAAAAAAAAAAAAAD4AQAA/v8HAPD/PwAAAIAA8AE4AByAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7/BwDw/z8AAACAAOAHOAAeAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+/wcA8P8/AAAAAgDABzgAHwBAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v8HAPD/PwAAAAMAgA84gA8AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7/BwDw/z8AAAAgAAAfOMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+/wcA8P8/AAAAIAAAPjjgAwAAAAD8AQAAAH8AAADAHwAAAAAAAAAA/v8HAPD/PwAAAAAAADw88AEAAADg/z8AAPD/DwAA/v8DAAAAAOAAAP7/BwDw/z8AAAAAAAD4f/gAAAAA8P//AAD8/z8AAP//DwAAAAD8AAD+/wcA8P8/AAAAAAAA8P9/AAAAAPz//wEA//9/AOD//x8AAACA/wAA/v8HAPD/PwAAgAAAAODnHwAAgAD///8DwP///wHw//8/AAAA+P8AAP7/BwDw/z8AAIAAAAD49w8AAIDA////D+D///8D+P///wAAAP7/AAD+/wcA8P8/AACAAAAA/PcfAACA4PH//x/4/P//Bz7///8BAOD//wAA/v8HAPD/PwAAAADgP/6DfwAAgHCA//8fHMD//wcH+P//AQD4//8AAP7/BwDw/z8AAAAA4P//w/8AAIA4AP7/Pw6A//+PAeD//wMA////AAD+/wcA8P8/AAAAAOD//8H/AQCAHAD4/z8AAP//HwDA//8DAP///wAA/v8HAPD/PwAAAADA/x8Y/v8HgA4A+P9/AAD8/x8AgP//BwD///8AAP7/BwDw/z8AAAAAAAAACPz/B4AGAPD/fwAA/P8/AAD//wcA/P//AAD+/wcA8P8/AAAAAAAAAAD4/wOAAwDg//8AAPj/PwAA/v8PAPD//wAA/v8HAPD/PwAAAAAAgAABAPEBgAMAwP//AADw/z8AAP7/DwDg//8AAP7/BwDw/z8AAAAAAIBwCAEAAIADAMD//wEA8P9/AAD8/x8AwP//AAD+/wcA8P8/AAAAAACAeIgBAQCAAQDA//8BAPD/fwAA/P8fAMD//wAA/v8HAPD/PwAAAAAAADyIAwEAgAEAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAeDAcBAIABAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAACADw4eAQCAAQCA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAwAcOHgAAgAMAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAOADDjwAAIADAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAADwAQ74AACAAwCA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAA+AAO8AEAgAYAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAHwADvABAIAGAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAB8AA7gAwCABACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAGAAOwA8AgBgAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAADoAPAIAgAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAA4ABwCAYACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAPAAAAgAABgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAADwAAAIAAAYD//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAA8AAACAAAyA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAPAAAAgABggP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAADgAAAIAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAACAAACB//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAAAAAAgAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAAAAAAAIAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAACAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAAAAAAgAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAAAAAAAIAAAMD//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAACAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAAAAAAgAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAAAAAAAIAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAACAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAgAAAAAAAAAAAgAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAIAAAAAAAAAAAIAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAACAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAAAAAAAAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAAAAAAAAAAAAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAAAAAAAAAAAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAAAAAAAAAAAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAAACAAAAAAAAIAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAgAgAAAAAAAAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAIAIAAAAAAAQAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAACACAAAAAAAEAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAgAAgAAAAAIAAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAIACAEQCAAAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAEACAHwD8AABAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAABAAgBsA/AkAQAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAAIA7APwJAEAAAgP//AQDg/38AAPj/HwDA//8AAP7/BwDw/z8AAAAQACAPwD8AAAAAAID//wEA4P9/AAD4/x8AwP//AAD+/wcA8P8/AAAAAAQAD8A/ABAAAACA//8BAOD/fwAA+P8fAMD//wAA/v8HAPD/PwAAAAAEAAbAPwAAAAAAgP//AwDg//8AAPz/PwDA//8BAP//DwD4/z8AAAAAEAAAwD8ACAAAAMD//wMA8P//AAD8/z8A4P//AQD//w8A+P9/AAAAAAAAAMA/AgAAAADg//8HAPj//wEA/v9/APD//wOA//8fAPz//wAAAAAAAADAPwICAAAA8P//DwD8//8DAP///wD4//8HwP//PwD+//8BAAAAggAAwD8AAAAAAPj//x8A/v//B4D///8B/P//D+D//38A////AwAAAAAAAMA/AAAAAAD4//8/AP///w/A////Af7//x/w////gP///wcAAIAAAQDAP0AMAAAA/v//f4D///8f4P///wf///8/+P///8H///8PAAAAAAgAwD8OAAAAAP7//3+A////H+D///8H////P/j////B////DwAAAAAAAMB/BgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQYADA/wJBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBsA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDgD/AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwBAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQBAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAYACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), (ch) => ch.charCodeAt(0));
  const SKY_LOW = [246, 204, 198];

  // 1-bit bitmap of the advertising board text, built from the pixel font.
  function boardBitmap(text) {
    const w = text.length * 6;
    const bits = new Uint8Array(w * 7);
    for (let i = 0; i < text.length; i++) {
      const gl = PP.Font.glyph(text[i]);
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 5; x++) if (gl[y][x] === '#') bits[y * w + i * 6 + x] = 1;
      }
    }
    return { w: w, bits: bits };
  }
  const SKY = [[0, [255, 255, 255]], [0.5, [252, 246, 240]], [0.85, [250, 224, 218]], [1, [246, 204, 198]]];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function hash(x, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function lerpCol(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function skyAt(t) {
    for (let i = 1; i < SKY.length; i++) {
      if (t <= SKY[i][0]) {
        const a = SKY[i - 1], b = SKY[i];
        return lerpCol(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return SKY[SKY.length - 1][1];
  }

  function makeCamera(e, R) {
    const pos = { x: 0, y: R * Math.sin(e), z: -0.5 - R * Math.cos(e) };
    return { pos: pos, sinA: Math.sin(e), cosA: Math.cos(e), e: e };
  }

  function toCam(cam, x, y, z) {
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    return [dx, dy * cam.cosA + dz * cam.sinA, -dy * cam.sinA + dz * cam.cosA];
  }

  /**
   * Build the scene for a W x H game-pixel screen.
   * opts.top / opts.bottom: pixels to keep clear for the HUD / safe areas.
   * opts.margin: extra pixels rendered around the edges (used for screen shake).
   */
  function build(W, H, opts) {
    const top = opts.top, bottom = opts.bottom, M = opts.margin;
    const R = 25;
    const avail = H - top - bottom;

    // Pick the camera elevation: low and cinematic on wide screens, steeper on tall
    // phone screens so the court fills the display.
    function measure(e) {
      const cam = makeCamera(e, R);
      const n = toCam(cam, 0, 0, -10.8), t = toCam(cam, 0, 4.1, 10), c = toCam(cam, 5, 0, -9.8);
      const yN = n[1] / n[2], yT = t[1] / t[2], xW = c[0] / c[2];
      return { cam: cam, fw: (W / 2 - 1) / xW, fh: (avail * 0.86) / (yT - yN), yN: yN };
    }
    let deg = 24;
    for (; deg <= 58; deg += 0.5) {
      const m = measure((deg * Math.PI) / 180);
      if (m.fh <= m.fw) break;
    }
    const m = measure((Math.min(deg, 58) * Math.PI) / 180);
    const cam = m.cam;
    const f = Math.min(m.fw, m.fh);
    const cx = Math.floor(W / 2) + 0.5; // centre on a pixel so the centre line is crisp
    const cy = H - bottom + f * m.yN;
    const pos = cam.pos;

    function project(x, y, z) {
      const c = toCam(cam, x, y, z);
      const iz = 1 / c[2];
      return { x: cx + f * c[0] * iz, y: cy - f * c[1] * iz, s: f * iz };
    }
    function rayDir(sx, sy) {
      const xc = (sx - cx) / f, yc = -(sy - cy) / f;
      return [xc, yc * cam.cosA - cam.sinA, yc * cam.sinA + cam.cosA];
    }
    function unproject(sx, sy) {
      const d = rayDir(sx, sy);
      if (d[1] >= -1e-4) return null;
      const t = -pos.y / d[1];
      return { x: pos.x + t * d[0], z: pos.z + t * d[2] };
    }

    const farTop = project(0, 4, 10).y;
    const hb = Math.max(4, Math.round(farTop - Math.max(4, H * 0.035)));

    const BW = W + M * 2, BH = H + M * 2;

    // ---------------- sky (screen space, not shaken)
    const sky = document.createElement('canvas');
    sky.width = W;
    sky.height = H;
    {
      const g = sky.getContext('2d');
      const img = g.createImageData(W, H);
      const d = img.data;
      const N = Math.max(7, Math.round(hb / 5));
      const sunR = Math.max(9, Math.min(46, Math.round(Math.min(W * 0.2, hb * 0.5))));
      const sunX = Math.round(W * 0.7), sunY = hb - Math.round(sunR * 0.35);
      for (let y = 0; y < H; y++) {
        const t = Math.min(1, y / Math.max(1, hb));
        for (let x = 0; x < W; x++) {
          const tt = t * N + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5);
          let col = skyAt(Math.max(0, Math.min(N, Math.round(tt))) / N);
          const dx = x - sunX, dy = y - sunY, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= sunR) {
            const rel = dy / sunR;
            const period = Math.max(3, Math.round(sunR / 4));
            const gap = rel > 0.1 ? Math.min(period - 1, Math.floor(1 + rel * period * 0.55)) : 0;
            const inGap = gap > 0 && ((dy % period) + period) % period < gap;
            if (!inGap) col = lerpCol([232, 58, 58], [190, 22, 28], (dy + sunR) / (2 * sunR));
          } else if (dist <= sunR * 1.45 && BAYER[(y & 3) * 4 + (x & 3)] < 7) {
            col = lerpCol(col, [250, 196, 196], 0.35);
          }
          const p = (y * W + x) * 4;
          d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }

    // ---------------- world: skyline, stands, surroundings, court, walls
    // Rendered twice: the second copy has the crowd on its feet for celebrations.
    const MILL = {
      m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
      i: ['.#.', '...', '##.', '.#.', '.#.', '.#.', '###'],
      l: ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
      w: ['.###.', '##.##', '#.#.#', '##.##', '#.#.#', '#.#.#', '.###.']
    };
    const board = (function () {
      const segs = [
        { glyphs: 'CUPTC'.split('').map((ch) => PP.Font.glyph(ch)), bg: C.board, fg: C.boardText }
      ];
      const cols = [];
      segs.forEach((sg) => {
        const push = (colBits) => cols.push({ bits: colBits, bg: sg.bg, fg: sg.fg });
        for (let p = 0; p < 4; p++) push(null);
        sg.glyphs.forEach((gl) => {
          if (!gl) { push(null); push(null); return; }
          for (let x = 0; x < gl[0].length; x++) push(gl.map((r) => r[x] === '#'));
          push(null);
        });
        for (let p = 0; p < 3; p++) push(null);
      });
      return cols;
    })();

    function crowdCol(ax, z, cheer) {
      const ru = (ax - 7.6) / 0.8, r = Math.floor(ru), fu = ru - r;
      const sv = (z + 100) / 0.6, sIdx = Math.floor(sv), fv = sv - sIdx;
      if (fu < 0.12) return C.step;
      const h = hash(r * 7 + 3, sIdx);
      if (h % 100 >= 84) return C.seat;
      const lift = cheer && h & 16 ? 0.24 : 0;
      const hu = fu - lift;
      if (hu > 0.56 && hu < 0.86 && fv > 0.28 && fv < 0.72) {
        return hu > 0.76 ? CROWD_HAIR[(h >>> 9) % CROWD_HAIR.length] : CROWD_SKIN[(h >>> 5) % CROWD_SKIN.length];
      }
      if (hu > 0.12 && hu <= 0.58 && fv > 0.14 && fv < 0.86) return CROWD_SHIRT[(h >>> 12) % CROWD_SHIRT.length];
      if (lift && fu > 0.8 && (fv < 0.2 || fv > 0.8)) return CROWD_SKIN[(h >>> 5) % CROWD_SKIN.length];
      return C.stand;
    }

    // Boards alternate a red CUPTC panel with a white panel carrying the mill logo,
    // sampled straight from the logo artwork so it stays sharp at any size.
    const LC = board.length * 0.12, LM = 2.8, PERIOD = LC + LM;
    const LOGO_H = 0.62, LOGO_W = LOGO_H * MILL_TEX.w / MILL_TEX.h;
    function boardCol(z, y, side) {
      if (y > 0.82) return C.boardTop;
      const t = ((((side > 0 ? -z : z)) % PERIOD) + PERIOD) % PERIOD;
      if (t < LC) {
        const col = board[Math.floor(t / 0.12)];
        const row = Math.floor((0.8 - y) / 0.115);
        if (row >= 0 && row < 7 && col.bits && col.bits[row]) return col.fg;
        return col.bg;
      }
      const lx = (t - LC - (LM - LOGO_W) / 2) / LOGO_W, ly = (0.72 - y) / LOGO_H;
      if (lx >= 0 && lx < 1 && ly >= 0 && ly < 1) {
        const i = Math.floor(ly * MILL_TEX.h) * MILL_TEX.w + Math.floor(lx * MILL_TEX.w);
        if ((MILL_BITS[i >> 3] >> (i & 7)) & 1) return C.millText;
      }
      return C.millBoard;
    }

    function renderWorld(cheer) {
      const canvas = document.createElement('canvas');
      canvas.width = BW;
      canvas.height = BH;
      const g = canvas.getContext('2d');
      const img = g.createImageData(BW, BH);
      const d = img.data;
      const put = (i, j, col) => {
        if (i < 0 || j < 0 || i >= BW || j >= BH) return;
        const p = (j * BW + i) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      };

      for (let j = 0; j < BH; j++) {
        const sy = j - M;
        if (sy < hb) continue;
        const dRow = rayDir(0, sy + 0.5), dNext = rayDir(0, sy + 1.5);
        const dy = dRow[1], dz = dRow[2];
        const hitsFloor = dy < 0;
        const tF = hitsFloor ? -pos.y / dy : Infinity;
        const zF = pos.z + tF * dz;
        const zN = dNext[1] < 0 ? pos.z + (-pos.y / dNext[1]) * dNext[2] : zF + 50;
        const dzRow = Math.abs(zN - zF);
        const dxPx = tF / f;

        for (let i = 0; i < BW; i++) {
          const sx = i - M;
          const xc = (sx + 0.5 - cx) / f;
          let col;
          let tHit = tF;
          if (!hitsFloor) {
            col = SKY_LOW;
          } else {
            const x = pos.x + tF * xc;
            const ax = Math.abs(x), az = Math.abs(zF);
            if (ax <= 5 && az <= 10) {
              const lwz = Math.max(0.03, dzRow * 0.5), lwx = Math.max(0.03, dxPx * 0.5);
              if (Math.abs(az - COURT.service) < lwz || (ax < lwx && az <= COURT.service)) col = C.line;
              else if (Math.min(5 - ax, 10 - az) < Math.max(0.1, dxPx * 0.8)) col = C.courtEdge;
              else col = (hash(Math.floor(x * 6), Math.floor(zF * 6)) & 7) === 0 ? C.courtGrain : C.court;
            } else if (ax <= 7.2 && zF >= -13.5 && zF <= 12.5) {
              col = (hash(Math.floor(x * 5), Math.floor(zF * 5)) & 7) === 0 ? C.apronGrain : C.apron;
            } else if (dzRow > 1.4) {
              col = C.grassMid;
            } else {
              col = Math.floor((zF + 1000) / 2.5) & 1 ? C.grass1 : C.grass2;
            }
          }

          // Spectator stands along both sides, with advertising boards in front.
          if (xc !== 0) {
            const axc = Math.abs(xc), side = xc > 0 ? 1 : -1;
            let t = 7.2 / axc;
            if (t < tHit) {
              const y = pos.y + t * dy, z = pos.z + t * dz;
              if (y >= 0 && y <= 0.9 && Math.abs(z) <= 12.5) { tHit = t; col = boardCol(z, y, side); }
            }
            t = (0.9 - 7.6 * 0.6 - pos.y) / (dy - 0.6 * axc);
            if (t > 0 && t < tHit) {
              const ax = t * axc, z = pos.z + t * dz;
              if (ax >= 7.6 && ax <= 14 && Math.abs(z) <= 13) { tHit = t; col = crowdCol(ax, z, cheer); }
            }
            t = 14 / axc;
            if (t < tHit) {
              const y = pos.y + t * dy, z = pos.z + t * dz;
              if (y >= 0 && y <= 5.35 && Math.abs(z) <= 13) { tHit = t; col = y > 5.1 ? C.step : C.standBack; }
            }
          }

          // Court walls: far glass (z = 10) and the two side walls (x = +/-5).
          let tw = Infinity, type = null, u = 0, v = 0;
          if (dz > 0) {
            const t = (10 - pos.z) / dz;
            if (t < tHit) {
              const wx = pos.x + t * xc, wy = pos.y + t * dy;
              if (wx >= -5 && wx <= 5 && wy >= 0 && wy <= 4) { tw = t; type = 'far'; u = wx; v = wy; }
            }
          }
          if (xc !== 0) {
            const t = ((xc > 0 ? 5 : -5) - pos.x) / xc;
            if (t > 0 && t < tHit && t < tw) {
              const wz = pos.z + t * dz, wy = pos.y + t * dy;
              if (wz >= -10 && wz <= 10 && wy >= 0 && wy <= PP.sideWallHeight(wz)) { tw = t; type = 'side'; u = wz; v = wy; }
            }
          }
          if (type) {
            const pw = tw / f;
            let glassTop, wallTop, postD;
            if (type === 'far') {
              glassTop = 3; wallTop = 4;
              const q = (((u + 1) % 2) + 2) % 2; postD = Math.min(q, 2 - q);
            } else {
              const a = Math.abs(u);
              glassTop = a >= 8 ? 3 : a >= 6 ? 2 : 0;
              wallTop = a >= 8 ? 4 : 3;
              const q = ((u % 2) + 2) % 2; postD = Math.min(q, 2 - q);
            }
            const barW = Math.max(0.05, pw * 0.6);
            if (postD < Math.max(0.05, pw * 0.6)) {
              col = C.frame;
            } else if (Math.abs(v - wallTop) < barW || (glassTop > 0 && Math.abs(v - glassTop) < barW * 0.8)) {
              col = C.frame;
            } else if (v < glassTop) {
              col = lerpCol(col, C.glass, 0.38);
              const st = (((u * 0.8 + v * 0.55) % 2.4) + 2.4) % 2.4;
              if (st < 0.12 || (st > 0.26 && st < 0.32)) col = lerpCol(col, [255, 255, 255], 0.5);
            } else {
              // chain-link fence: a diagonal lattice of dark pixels
              col = ((sx + sy) & 3) === 0 || ((sx - sy) & 3) === 0 ? C.mesh : lerpCol(col, C.mesh, 0.15);
            }
          }
          put(i, j, col);
        }
      }

      drawSkyline(put);
      g.putImageData(img, 0, 0);
      return canvas;
    }

    // Cambridge skyline silhouette standing on the backdrop line (rows above hb).
    function drawSkyline(put) {
      const u = Math.max(1, Math.min(3, Math.floor(Math.min(W / 210, (hb * 0.62) / 31))));
      const base = hb + M; // buffer row of the ground line
      const fill = (x0, bottomPx, w, h, col) => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) put(Math.round(x0) + x + M, base - 1 - bottomPx - y, col);
        }
      };
      const tri = (xc, bottomPx, halfW, h, col) => {
        for (let y = 0; y < h; y++) {
          const hw = Math.round(halfW * (1 - y / h));
          for (let x = -hw; x <= hw; x++) put(Math.round(xc) + x + M, base - 1 - bottomPx - y, col);
        }
      };
      // Cambridge skyline traced from the club's reference silhouette, in one colour.
      const src = SKYLINE;
      const bits = SKYLINE_BITS;
      const on = (x, y) => { const i = y * src.w + x; return (bits[i >> 3] >> (i & 7)) & 1; };
      const tw = Math.min(W, Math.floor((hb * 0.64 * src.w) / src.h));
      const th = Math.max(8, Math.round((tw * src.h) / src.w));
      const x0 = Math.floor((W - tw) / 2);
      const sx = src.w / tw, sy = src.h / th;
      const mask = new Uint8Array(tw * th);
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          let n = 0, hits = 0;
          for (let yy = Math.floor(ty * sy); yy < Math.floor((ty + 1) * sy); yy++) {
            for (let xx = Math.floor(tx * sx); xx < Math.floor((tx + 1) * sx); xx++) { n++; hits += on(xx, yy); }
          }
          mask[ty * tw + tx] = n && hits / n > 0.34 ? 1 : 0;
        }
      }
      // close pinholes so thin tracery reads as solid pixel shapes
      const at = (x, y) => (x >= 0 && y >= 0 && x < tw && y < th ? mask[y * tw + x] : 0);
      const solid = mask.slice();
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          if (at(tx, ty)) continue;
          if ((at(tx - 1, ty) && at(tx + 1, ty) && at(tx, ty + 1)) || (at(tx, ty - 1) && at(tx, ty + 1) && (at(tx - 1, ty) || at(tx + 1, ty)))) solid[ty * tw + tx] = 1;
        }
      }
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) if (solid[ty * tw + tx]) put(x0 + tx + M, base - th + ty, C.sil);
      }
      // rolling hills: a pale back range, then a low front range in the skyline green,
      // rising towards the sides so the silhouette's edges melt into the landscape
      const A = Math.max(3, th * 0.2);
      const hill = (x, k) => {
        const outside = Math.max(0, x0 - x, x - (x0 + tw)) / Math.max(1, W * 0.25);
        return A * (k + 0.35 * Math.sin(x * 0.045 + k * 7) + 0.25 * Math.sin(x * 0.013 + 2) + 0.15 * Math.sin(x * 0.11)) + A * 0.9 * Math.min(1, outside);
      };
      for (let x = -M; x < W + M; x++) {
        const hb2 = Math.round(hill(x, 0.9)), hf = Math.round(hill(x + 37, 0.45));
        const tx = x - x0;
        const inSil = (y) => tx >= 0 && tx < tw && y < th && solid[(th - 1 - y) * tw + tx];
        for (let y = hf; y < hb2; y++) if (!inSil(y)) put(x + M, base - 1 - y, C.far);
        for (let y = 0; y < hf; y++) put(x + M, base - 1 - y, C.sil);
      }
      // carry the ground line across the full width
      const gh = Math.max(1, Math.round(th * 0.03));
      for (let x = -M; x < W + M; x++) for (let y = 0; y < gh; y++) put(x + M, base - 1 - y, C.sil);
    }

    const world = renderWorld(false);
    const worldCheer = renderWorld(true);

    // ---------------- net (transparent layer drawn between the two halves)
    const net = document.createElement('canvas');
    net.width = BW;
    net.height = BH;
    {
      const g = net.getContext('2d');
      const img = g.createImageData(BW, BH);
      const d = img.data;
      for (let j = 0; j < BH; j++) {
        const sy = j - M;
        for (let i = 0; i < BW; i++) {
          const sx = i - M;
          const r = rayDir(sx + 0.5, sy + 0.5), r2 = rayDir(sx + 0.5, sy + 1.5);
          if (r[2] <= 0 || r2[2] <= 0) continue;
          const t = (0 - pos.z) / r[2];
          const x = pos.x + t * r[0], y = pos.y + t * r[1];
          const rowH = Math.abs(y - (pos.y + ((0 - pos.z) / r2[2]) * r2[1]));
          const ax = Math.abs(x);
          const pw = t / f;
          let col = null, a = 255;
          if (ax <= 5.08 && ax >= 5 - Math.max(0.06, pw * 0.7) && y >= 0 && y <= 1.0) {
            col = C.post;
          } else if (ax <= 5) {
            const netTop = COURT.net + (ax / 5) * (COURT.netSide - COURT.net);
            if (y >= 0 && y <= netTop) {
              if (y > netTop - Math.max(0.05, rowH)) col = C.tape;
              else if (((sx + sy) & 1) === 0) { col = C.netMesh; a = 215; }
              else if (y < Math.max(0.04, rowH * 0.9)) col = C.netMesh;
            }
          }
          if (!col) continue;
          const p = (j * BW + i) * 4;
          d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = a;
        }
      }
      g.putImageData(img, 0, 0);
    }

    return {
      W: W, H: H, M: M, f: f, hb: hb, cam: cam,
      sky: sky, world: world, worldCheer: worldCheer, net: net,
      project: project, unproject: unproject
    };
  }

  PP.Scene = { build: build };
})();
