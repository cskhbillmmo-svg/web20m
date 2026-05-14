(function () {
  const key = "scroll:" + location.pathname;

  const customScroller = document.querySelector(".home-page, .cinema-scroll");
  const scroller =
    customScroller && getComputedStyle(customScroller).overflowY === "auto"
      ? customScroller
      : null;

  function getScroll() {
    return scroller ? scroller.scrollTop : window.scrollY;
  }
  function setScroll(y) {
    if (scroller) scroller.scrollTop = y;
    else window.scrollTo(0, y);
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const saved = Number(sessionStorage.getItem(key) || 0);
  if (saved > 0) {
    requestAnimationFrame(() => setScroll(saved));
    window.addEventListener("load", () => setScroll(saved), { once: true });
  }

  let raf = 0;
  function save() {
    sessionStorage.setItem(key, String(getScroll()));
  }
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      save();
    });
  }

  (scroller || window).addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("beforeunload", save);
  window.addEventListener("pagehide", save);
})();
