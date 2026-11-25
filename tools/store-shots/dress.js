/* store screenshots: picture-only renames (nothing is saved) */
window.__dress = function () {
  const R = [[/Enterprise Roofing Group/g, 'Summit Roofing Co'], [/BuilderPro Test Co/g, 'Summit Roofing Co'], [/Enterprise Tester/g, 'Mike Reyes'],
    [/\s*\(sample\)/g, ''], [/Good (afternoon|evening)/g, 'Good morning'], [/, Enterprise\b/g, ', Mike']];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: x => /^(STYLE|SCRIPT)$/.test(x.parentNode && x.parentNode.nodeName) ? 2 : 1 }); let n;
  while ((n = w.nextNode())) { let t = n.textContent, o = t; R.forEach(([a, b]) => { t = t.replace(a, b); }); if (t.trim() === 'ET') t = t.replace('ET', 'MR'); if (t !== o) n.textContent = t; }
  /* the setup progress bar and "get the app" banners don't belong in a store picture */
  document.querySelectorAll('*').forEach(e => { if (e.children.length < 6 && /^Set ?up \d/.test((e.innerText || '').trim()) && e.getBoundingClientRect().height < 80) e.style.display = 'none'; });
  const bb = document.getElementById('bpclBar'); if (bb) bb.remove(); document.body.classList.remove('bpcl-bar-on');
};
