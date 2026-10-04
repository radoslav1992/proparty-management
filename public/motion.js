// Reveal timings and directional blur motion adapted from the supplied Nexsas template.
addEventListener("DOMContentLoaded", () => {
  if (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !window.gsap ||
    !window.ScrollTrigger
  )
    return;
  gsap.registerPlugin(ScrollTrigger);
  document.querySelectorAll("[data-ns-animate]").forEach((el) => {
    const direction = el.getAttribute("data-direction") || "down",
      offset = Number(el.getAttribute("data-offset") || 60);
    const props = {
      opacity: 0,
      filter: "blur(16px)",
      duration: Number(el.getAttribute("data-duration") || 0.6),
      delay: Number(el.getAttribute("data-delay") || 0),
      ease: "power2.out",
      clearProps: "all",
    };
    props[direction === "left" || direction === "right" ? "x" : "y"] =
      (direction === "left" || direction === "up" ? -1 : 1) * offset;
    if (!el.hasAttribute("data-instant"))
      props.scrollTrigger = {
        trigger: el,
        start: el.getAttribute("data-start") || "top 90%",
        once: true,
      };
    gsap.from(el, props);
  });
  if (
    !document.body.classList.contains("application") &&
    innerWidth > 768 &&
    window.Lenis
  ) {
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
});
