/* Shared book HTML in a style-isolated, non-scrolling surface (not an iframe). */
window.HUB_BOOK_STUDY = (() => {
  let root;
  function mount(host, study, discuss) {
    host.dataset.bookId = study.book_id;
    root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.replaceChildren();
    const stylesReady = [];
    for (const href of ["/book-assets/styles.css", "/assets/book-study.css"]) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = (window.HUB_SITE_BASE || "") + href;
      stylesReady.push(new Promise(resolve => {
        css.addEventListener("load", resolve, { once: true });
        css.addEventListener("error", resolve, { once: true });
      }));
      root.append(css);
    }
    // Only the same-origin, typed server renderer supplies this inert fragment.
    const parsed = new DOMParser().parseFromString(study.html, "text/html");
    const content = document.createElement("div");
    content.className = "book-study-content";
    content.append(...parsed.body.childNodes);
    root.append(content);
    for (const section of study.sections) {
      const element = root.getElementById(section.id);
      if (!element || section.id === "sources" || section.id.startsWith("book-section-")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "book-discuss";
      button.textContent = "讨论这一段 ↗";
      button.setAttribute("aria-label", `讨论：${section.title}`);
      button.addEventListener("click", () => discuss(section));
      element.append(button);
    }
    content.addEventListener("click", event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      if (jump(anchor.hash.slice(1))) event.preventDefault();
    });
    return Promise.all(stylesReady);
  }
  function jump(id) {
    const element = root?.getElementById(id);
    if (!element) return false;
    element.tabIndex = -1;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start" });
    return true;
  }
  return Object.freeze({ mount, jump });
})();
