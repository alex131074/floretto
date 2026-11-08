/* 3D: букет, который перекрашивается волной в выбранную гамму. Чистый WebGL, без библиотек. */
(function () {
  var cv = document.getElementById('fl');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.FL = { pal: function () {}, scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };

  /* лепесток: растёт вдоль y, края загибаются к центру цветка, кончик отгибается наружу */
  function petal(g, o) {
    var F = function (u, v) {
      var s = u * 2 - 1, w = o.w * Math.pow(Math.sin(PI * (.08 + .86 * v)), o.sh || .6);
      var x = s * w, y = o.l * v, z = -o.cup * s * s * w + o.curl * v * v * v * o.l;
      y -= o.tipDip ? o.tipDip * s * s * v * v : 0;
      return [x, y, z, o.m === undefined ? v : o.m];
    };
    g.surf(F, o.nu || 7, o.nv || 8, chain(rotY(o.a), trans(0, o.y || 0, o.r), rotX(o.t)));
  }
  function disc(g, r, h, m, M) { // приплюснутая полусфера: серединка, чашелистик
    g.surf(function (u, v) { var a = u * 2 * PI, b = v * PI / 2; return [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * h, Math.sin(a) * Math.cos(b) * r, m]; }, 18, 5, M);
  }

  /* роза: тугой бутон внутри, раскрытые лепестки снаружи */
  var rose = new Geo(), GA = 2.39996;
  [[5, .14, .32, .5, .2, .25, .02], [5, .45, .42, .62, .3, .4, .06], [6, .8, .52, .72, .38, .5, .12], [6, 1.12, .6, .76, .44, .55, .22]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(rose, { a: k / L[0] * 2 * PI + li * .7, t: L[1], w: L[2], l: L[3], r: L[4] * .35, cup: L[5], curl: L[6], y: -li * .05 });
  });
  disc(rose, .34, -.28, .1, ident());
  var roseB = rose.upload();

  /* кустовая роза: маленькая и раскрытая */
  var spray = new Geo();
  [[5, .5, .3, .4, .2, .35, .05], [6, 1.0, .36, .46, .3, .3, .15]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(spray, { a: k / L[0] * 2 * PI + li * .6, t: L[1], w: L[2], l: L[3], r: L[4] * .3, cup: L[5], curl: L[6] });
  });
  disc(spray, .2, -.18, .1, ident());
  var sprayB = spray.upload();

  /* хризантема-ромашка: серединка и два ряда узких лепестков */
  var daisy = new Geo();
  [[18, 1.25, .1, .78, .02], [16, 1.5, .09, .7, .1]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(daisy, { a: (k + li * .5) / L[0] * 2 * PI, t: L[1], w: L[2], l: L[3], r: .18, cup: .5, curl: L[4], sh: .45, nu: 3, nv: 6, y: .04 - li * .03 });
  });
  disc(daisy, .24, .14, 2, trans(0, .02, 0));
  var daisyB = daisy.upload();

  /* лист эвкалипта/зелени */
  var leaf = new Geo();
  petal(leaf, { a: 0, t: 0, w: .26, l: 1.25, r: 0, cup: .25, curl: .25, sh: .9, nv: 9 });
  var leafB = leaf.upload();

  /* обёртка: два слоя бумаги с волнистым краем, спереди ниже, чтобы цветы были видны */
  function wrapGeo(rot, lift, waves, m) {
    var g = new Geo();
    g.surf(function (u, v) {
      var a = u * 2 * PI, t = v;
      var front = Math.max(0, Math.cos(a - PI / 2 + rot));
      var top = .55 + lift - 1.0 * front * front + .16 * Math.sin(a * waves);
      var y = -3.3 + (top + 3.3) * t;
      var r = (.32 + Math.pow(t, 1.25) * .98) * (1 + .05 * Math.sin(a * waves + 1) * t);
      return [Math.cos(a) * r, y, Math.sin(a) * r, m + t * .9];
    }, 72, 14);
    return g.upload();
  }
  var wrapA = wrapGeo(0, 0, 5, 0), wrapB = wrapGeo(.5, .22, 4, 0);
  var ribbon = new Geo();
  ribbon.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, R = .52, r = .07; return [Math.cos(a) * (R + Math.cos(b) * r), Math.sin(b) * r * 1.6, Math.sin(a) * (R + Math.cos(b) * r), 2]; }, 40, 8);
  [-1, 1].forEach(function (s) { // хвосты ленты
    ribbon.surf(function (u, v) { var x = s * (.1 + v * .5), y = -v * 1.2, z = .55 + Math.sin(v * 3) * .08; return [x + (u - .5) * .22, y, z + (u - .5) * .02 * s, 2]; }, 2, 8);
  });
  var ribbonB = ribbon.upload();
  var stem = new Geo();
  stem.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .05, -v * 1.1, Math.sin(a) * .05, .5]; }, 8, 1);
  var stemB = stem.upload();

  /* ---------- шейдеры ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uE;uniform float uFade;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;' +
    'vec3 base=vM<1.5?uC1*mix(.58,1.,smoothstep(0.,.95,vM)):uC2;' +
    'vec3 L1=normalize(vec3(-.55,.85,.65));vec3 L2=normalize(vec3(.8,.15,.35));' +
    'float d1=max(0.,dot(N,L1)*.7+.3);float d2=max(0.,dot(N,L2))*.3;float bl=max(0.,dot(-N,L1))*.3;' +
    'float rim=pow(1.-max(dot(N,V),0.),2.5);vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.),36.)*.1;' +
    'float ao=mix(.5,1.,smoothstep(-3.4,1.4,vW.y));' +
    'vec3 c=base*(.36+d1*.8+d2)*ao+base*bl*.8+vec3(sp)+base*rim*.25+vec3(1.,.93,.88)*rim*.12;' +
    'gl_FragColor=vec4(min(c,vec3(1.))*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uC2', 'uE', 'uFade'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });

  function draw(buf, W, c1, c2) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2 || c1);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- гаммы: как в прайсе – «собираем подобное по цветовой гамме» ---------- */
  var PAL = [
    { f: [[.99, .74, .8], [.98, .97, .94], [.99, .88, .76], [.95, .55, .7]], paper: [.96, .8, .83], paper2: [.99, .95, .95], rib: [.86, .46, .6] },
    { f: [[.98, .97, .94], [.99, .95, .85], [.96, .96, .9], [.92, .93, .86]], paper: [.97, .96, .93], paper2: [.88, .91, .86], rib: [.74, .78, .7] },
    { f: [[.92, .16, .45], [.99, .5, .35], [.99, .74, .26], [.98, .42, .62]], paper: [.14, .13, .14], paper2: [.98, .9, .85], rib: [.86, .7, .38] },
    { f: [[.7, .58, .9], [.98, .97, .96], [.52, .38, .78], [.9, .8, .97]], paper: [.86, .8, .94], paper2: [.98, .96, .99], rib: [.55, .4, .72] },
    { f: [[.74, .06, .13], [.82, .1, .17], [.62, .04, .1], [.88, .16, .22]], paper: [.12, .11, .11], paper2: [.3, .27, .25], rib: [.86, .7, .38], rose: 1 }
  ];
  var cur = { f: PAL[0].f.map(function (c) { return c.slice(); }), paper: PAL[0].paper.slice(), paper2: PAL[0].paper2.slice(), rib: PAL[0].rib.slice() }, pi = 0, roseMix = 0;
  var COL = { green: [.3, .47, .3], euc: [.5, .63, .58], stem: [.33, .5, .28], yolk: [.93, .72, .16] };
  var MAX = 24, RF = 2.05, FOCUS = [0, -3.2, 0];
  var TYPES = [roseB, daisyB, sprayB, roseB, daisyB, roseB, sprayB, roseB];
  var fl = [];
  for (var i = 0; i < MAX; i++) {
    var rho = RF * Math.sqrt((i + .35) / MAX), th = i * GA, k = rho / RF;
    var pos = [Math.cos(th) * rho, .25 + .95 * (1 - k * k), Math.sin(th) * rho];
    fl.push({ pos: pos, dir: norm([pos[0] - FOCUS[0], pos[1] - FOCUS[1], pos[2] - FOCUS[2]]), b: TYPES[(i * 3) % TYPES.length], slot: (i * 5) % 4, s: (.98 + .22 * ((i * 7) % 5) / 4), spin: i * 1.7, cur: 0, at: .5 + i * .06, wave: 0 });
  }
  var LV = 14, lv = [];
  for (i = 0; i < LV; i++) lv.push({ a: i / LV * 2 * PI + .2, cur: 0, at: .3 + i * .03, c: i % 2 ? COL.euc : COL.green, s: .85 + (i % 3) * .12 });
  var wR = RF + .62;

  /* ---------- кадр ---------- */
  var W = 0, H = 0, live = true, last = 0, time = 0, mx = 0, my = 0, tmx = 0, tmy = 0, fade = 0, scr = 0, scrT = 0, waveT = -9;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', function () { resize(); kick(); });
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  function lerp3(a, b, t) { for (var j = 0; j < 3; j++) a[j] += (b[j] - a[j]) * t; }

  function step(dt) {
    var k = 1 - Math.exp(-dt * 5.5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 3));
    mx += (tmx - mx) * k; my += (tmy - my) * k; scr += (scrT - scr) * k;
    var P = PAL[pi];
    /* цвет меняется волной от центра к краю */
    fl.forEach(function (f, i) {
      if (time >= f.at) f.cur += (1 - f.cur) * (1 - Math.exp(-dt * 6));
      var lag = (time - waveT) * 3.2 - Math.hypot(f.pos[0], f.pos[2]);
      if (reduce || lag > 0) { if (!f.c) f.c = P.f[f.slot].slice(); lerp3(f.c, P.f[f.slot], reduce ? 1 : 1 - Math.exp(-dt * 7)); f.rose = P.rose ? 1 : 0; }
      if (!f.c) f.c = P.f[f.slot].slice();
      f.wave = Math.max(0, 1 - Math.abs(lag) * 1.6);
    });
    lerp3(cur.paper, P.paper, reduce ? 1 : 1 - Math.exp(-dt * 4)); lerp3(cur.paper2, P.paper2, reduce ? 1 : 1 - Math.exp(-dt * 4)); lerp3(cur.rib, P.rib, reduce ? 1 : 1 - Math.exp(-dt * 4));
    lv.forEach(function (l) { if (time >= l.at) l.cur += (1 - l.cur) * (1 - Math.exp(-dt * 5)); });
  }
  function render() {
    if (!W) resize();
    var asp = W / H, d = 15.6 * Math.max(1, .86 / asp);
    var az = (reduce ? 0 : Math.sin(time * .35) * .3) + mx * .5 + scr * .8, el = .58 + my * .12 - scr * .2, tg = [0, -.85, 0];
    var eye = [Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d];
    var VP = mul(persp(.52, asp, 1, 80), lookAt(eye, tg));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3f(U.uE, eye[0], eye[1], eye[2]); gl.uniform1f(U.uFade, fade);
    var sx = wR / 1.3, root = rotY(reduce ? 0 : Math.sin(time * .5) * .04);
    for (var s = 0; s < 5; s++) draw(stemB, chain(root, trans((s - 2) * .07 * sx, -3.25, ((s * 3) % 5 - 2) * .05), rotZ((s - 2) * .05)), COL.stem);
    draw(wrapB, chain(root, scl(sx * .97, 1, sx * .97)), cur.paper2);
    draw(wrapA, chain(root, scl(sx * 1.05, 1, sx * 1.05)), cur.paper);
    draw(ribbonB, chain(root, trans(0, -2.35, 0), scl(sx * .86 + .1, 1, sx * .86 + .1)), cur.rib, cur.rib);
    lv.forEach(function (l) {
      if (l.cur < .01) return;
      var r = wR - .45, p = [Math.cos(l.a) * r, -.05, Math.sin(l.a) * r], dir = norm([p[0] * 1.4, .9, p[2] * 1.4]);
      draw(leafB, chain(root, trans(p[0], p[1], p[2]), basis(dir), scl(l.cur * l.s, l.cur * l.s, l.cur * l.s)), l.c);
    });
    fl.forEach(function (f, i) {
      if (f.cur < .01 || !f.c) return;
      var e = f.cur, sz = f.s * (e < 1 ? e * e * (3 - 2 * e) : 1) * (1 + f.wave * .14), sway = reduce ? 0 : Math.sin(time * 1.3 + i) * .03;
      var p = [f.pos[0] * (1 + sway), f.pos[1] - (1 - e) * .5 + f.wave * .12, f.pos[2]];
      draw(f.rose ? roseB : f.b, chain(root, trans(p[0], p[1], p[2]), basis(f.dir), rotY(f.spin + (reduce ? 0 : time * .05)), scl(sz, sz, sz)), f.c, COL.yolk);
    });
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    step(dt); render();
    if (live) requestAnimationFrame(frame);
  }
  var pending = false;
  function kick() {
    if (!reduce || pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; time += 10; for (var i = 0; i < 60; i++) step(.05); render(); });
  }
  window.FL = {
    pal: function (i) { pi = Math.max(0, Math.min(PAL.length - 1, i)); waveT = time; kick(); },
    scroll: function (p) { scrT = Math.max(0, Math.min(1, p)); kick(); },
    live: function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame); } }
  };
  resize();
  if (reduce) { kick(); live = false; } else requestAnimationFrame(frame);
})();
