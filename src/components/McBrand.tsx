/** Local copy of the mark published on McDonald's China's website. Rights remain with the brand owner. */
export function McBrandMark({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return <img className={`mc-brand-mark ${className}`} src="/brand/mcdonalds-logo.jpg" width="48" height="48" alt={decorative ? '' : '麦当劳金拱门标识'} draggable={false}/>;
}

export function McBrandTab() {
  return <span className="mc-brand-tab"><McBrandMark decorative/><span>麦当劳餐品探索册<small>McCOSMOS FIELD NOTES</small></span></span>;
}

/** Original paper-bag satellite, separate from the generic food illustration presets. */
export function McDeliverySatellite() {
  return <div className="mc-delivery-satellite" aria-hidden="true"><svg viewBox="0 0 180 200" fill="none">
    <path d="M14 119c-25 27 117 69 153 18M15 119c9-9 27-10 44-9m88 12c19 5 27 12 20 15" stroke="#C99B43" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 7"/>
    <path d="m48 39 84 5 13 117q-52 16-106-1Z" fill="#F4D8A5" stroke="#684536" strokeWidth="3" strokeLinejoin="round"/>
    <path d="m48 39 12 10 11-9 12 9 13-9 13 10 12-7 11 1M123 48l8 105 14 8" stroke="#B88C55" strokeWidth="2" strokeLinecap="round"/>
    <path d="M69 42c-3-38 43-38 41 1" stroke="#684536" strokeWidth="4" strokeLinecap="round"/>
    <image href="/brand/mcdonalds-logo.jpg" x="64" y="66" width="52" height="52"/>
    <path d="m51 130 3 20m9-20 2 23m10-23 1 23m10-23v23m12-23-1 22m12-23-2 21" stroke="#CFA56A" strokeWidth="2" strokeLinecap="round"/>
    <path d="m145 39 4-9 4 9 9 3-9 4-4 9-4-9-9-4Z" fill="#FFCC35" stroke="#684536" strokeWidth="1.5"/>
    <path d="m27 68 3-5 3 5 5 2-5 3-3 5-3-5-5-3Z" fill="#D55240"/>
  </svg><span>下一站，麦门宇宙。</span></div>;
}
