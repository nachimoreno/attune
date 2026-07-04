// One shared tooltip for every (i) dot. It lives on <body>: the rack's
// backdrop-filter makes it a containing block for position:fixed, and its
// overflow would clip anything positioned inside, so the tip must escape.

let tip = null;

function ensureTip() {
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tip';
    document.body.appendChild(tip);
  }
  return tip;
}

function show(anchor, text) {
  const t = ensureTip();
  t.textContent = text;
  t.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  const x = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8),
    window.innerWidth - w - 8);
  let y = r.bottom + 7;
  if (y + h > window.innerHeight - 8) y = r.top - h - 7;
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}

function hide() {
  if (tip) tip.classList.remove('on');
}

// tiny (i) button; hover or keyboard focus shows the explanation
export function infoDot(text) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'info-dot';
  b.textContent = 'i';
  b.setAttribute('aria-label', text);
  b.addEventListener('mouseenter', () => show(b, text));
  b.addEventListener('mouseleave', hide);
  b.addEventListener('focus', () => show(b, text));
  b.addEventListener('blur', hide);
  b.addEventListener('click', e => { e.preventDefault(); show(b, text); });
  return b;
}
