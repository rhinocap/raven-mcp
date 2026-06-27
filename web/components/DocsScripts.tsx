'use client'

import { useEffect } from 'react'

export default function DocsScripts() {
  useEffect(() => {
    eval(String.raw`
    // Highlight active TOC item on scroll
    var tocLinks = document.querySelectorAll('.toc a');
    var sections = [];
    tocLinks.forEach(function(link) {
      var id = link.getAttribute('href').replace('#', '');
      var el = document.getElementById(id);
      if (el) sections.push({ id: id, el: el, link: link });
    });

    // Nav glass darkening on scroll
    window.addEventListener('scroll', function() {
      var navEl = document.querySelector('nav');
      if (navEl && window.scrollY > 50) {
        navEl.style.borderColor = 'rgba(0, 191, 255, 0.12)';
        navEl.style.background = 'rgba(36, 36, 46, 0.82)';
        navEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 191, 255, 0.04)';
      } else if (navEl) {
        navEl.style.borderColor = '';
        navEl.style.background = '';
        navEl.style.boxShadow = '';
      }

      // TOC highlight
      var scrollY = window.scrollY + 100;
      var current = '';
      sections.forEach(function(s) {
        if (s.el.offsetTop <= scrollY) current = s.id;
      });
      tocLinks.forEach(function(link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + current);
      });
    });

    // Scroll reveal
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function(el) { revealObserver.observe(el); });
  `)
  }, [])

  return null
}
