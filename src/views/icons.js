'use strict';

// The SVG icon set from the original static design. Keys are stored in content.
const ICONS = {
  graduation: { label: 'শিক্ষা / প্রশিক্ষণ', svg: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>' },
  globe: { label: 'বিশ্ব / বৈদেশিক', svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' },
  people: { label: 'জনবল', svg: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6M14 15c3-1 7 0 7 5"/>' },
  briefcase: { label: 'চাকরি / ব্রিফকেস', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/>' },
  monitor: { label: 'আইটি / কম্পিউটার', svg: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M8 9l-2 1.5L8 12M16 9l2 1.5L16 12"/>' },
  cart: { label: 'ই-কমার্স / কার্ট', svg: '<path d="M3 4h2l2.5 11h11L21 8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>' },
  home: { label: 'আবাসন / অবকাশ', svg: '<path d="M3 20h18M5 20V10l7-5 7 5v10M10 20v-5h4v5"/>' },
  truck: { label: 'পরিবহন', svg: '<rect x="2" y="6" width="14" height="10" rx="1"/><path d="M16 9h3l3 3v4h-6"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>' },
  chat: { label: 'পরামর্শ / বার্তা', svg: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>' },
};

function iconSvg(key, cls = 'ico') {
  const icon = ICONS[key] || ICONS.graduation;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${icon.svg}</svg>`;
}

const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#0e3b2c" stroke="#d8ad4c" stroke-width="3"/>
        <path d="M14 42 H50" stroke="#d8ad4c" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M20 42 A12 12 0 0 1 44 42" fill="#d8ad4c"/>
        <g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round">
          <path d="M32 14 V22"/><path d="M19 19 L23.5 25"/><path d="M45 19 L40.5 25"/><path d="M13 30 L19 32"/><path d="M51 30 L45 32"/>
        </g>
        <path d="M18 48 H46" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>
      </svg>`;

module.exports = { ICONS, iconSvg, LOGO_SVG };
