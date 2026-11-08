/* Поведение страницы: открыто ли сейчас, гамма букета и бюджет в сообщение WhatsApp, фильтр работ, отзывы, форма. */
(function () {
  var WA = 'https://wa.me/79507895002';
  var TEL = '<a href="tel:+79507895002">+7 (950) 789-50-02</a> или напишите в <a href="' + WA + '" target="_blank" rel="noopener">WhatsApp</a>';
  var FORM_ENDPOINT = ''; /* {{адрес приёма заявок}} */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var hero = $('hero'), bar = $('bar'), contacts = $('contacts');

  /* Время в Омске (UTC+6): каждый день 9:00–21:00 */
  var h = new Date(Date.now() + 6 * 3600000).getUTCHours(), open = h >= 9 && h < 21, now = $('now');
  now.textContent = open ? 'Сейчас открыто' : (h < 9 ? 'Откроемся в 9:00' : 'Завтра с 9:00');
  now.classList.toggle('off', !open);
  now.hidden = false;

  /* гамма и бюджет – в готовое сообщение */
  var pal = 'нежная', bud = '2000–3000 ₽', go = $('waGo');
  function msg() { go.href = WA + '?text=' + encodeURIComponent('Здравствуйте! Хочу букет в гамме «' + pal + '», бюджет ' + bud + '.'); }
  function press(list, el) { list.forEach(function (b) { var on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  var dots = all('.dot');
  dots.forEach(function (d) {
    d.addEventListener('click', function () {
      press(dots, d); pal = d.getAttribute('data-name'); $('palName').textContent = pal; msg();
      if (window.FL && FL.pal) FL.pal(+d.getAttribute('data-p'));
    });
  });
  var chips = all('#budget .chip');
  chips.forEach(function (c) { c.addEventListener('click', function () { press(chips, c); bud = c.getAttribute('data-b'); msg(); }); });
  msg();

  /* фильтр работ по гамме */
  var fchips = all('#filter .chip'), works = all('#works .wk');
  fchips.forEach(function (c) {
    c.addEventListener('click', function () {
      press(fchips, c); var g = c.getAttribute('data-g');
      works.forEach(function (w) { w.classList.toggle('dim', g !== 'all' && w.getAttribute('data-g') !== g); });
    });
  });

  function update() {
    var H = innerHeight, hr = hero.getBoundingClientRect(), cr = contacts.getBoundingClientRect();
    if (window.FL) { FL.live(hr.bottom > 0); if (FL.scroll) FL.scroll(-hr.top / Math.max(1, hr.height)); }
    bar.classList.toggle('on', hr.bottom < H * .3 && cr.top > H * .6);
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); } }, { passive: true });
  addEventListener('resize', update);
  update();

  if (!reduce && 'IntersectionObserver' in window) {
    var rise = all('.sec h2,.sec .sub,.filter,.wk,.pc,.steps li,.score,.rev,.maplink,.form');
    rise.forEach(function (el) { el.classList.add('rise'); });
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rise.forEach(function (el) { seen.observe(el); });
  }

  var more = $('revMore'), btn = $('revBtn');
  btn.addEventListener('click', function () {
    more.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); btn.hidden = true;
    all('.rise', more).forEach(function (el) { el.classList.add('in'); });
  });

  var form = $('form'), fm = $('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ph = form.elements.phone, ok = ph.value.replace(/\D/g, '').length >= 10;
    ph.classList.toggle('invalid', !ok);
    if (!ok) { fm.textContent = 'Укажите телефон, чтобы мы могли связаться.'; ph.focus(); return; }
    if (!FORM_ENDPOINT) { fm.innerHTML = 'Заявки с сайта пока не подключены, поэтому ваш номер не отправлен. Позвоните: ' + TEL; return; }
    fetch(FORM_ENDPOINT, { method: 'POST', body: new FormData(form) })
      .then(function (r) { if (!r.ok) throw 0; fm.textContent = 'Заявка принята, свяжемся с вами.'; form.reset(); })
      .catch(function () { fm.innerHTML = 'Заявка не отправилась. Позвоните: ' + TEL; });
  });
})();
