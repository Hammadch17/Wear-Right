"use client";

import { PersonStanding } from "lucide-react";

import ProductImage from "@/components/ProductImage";
import type { ApiItem } from "@/features/recommender/api";
import { mannequinSkin, type ScanDepth, type ScanGender } from "@/features/scanner/gender";
import { useNavigate } from "@/lib/navigation";

type Props = {
  item: ApiItem;
  gender: ScanGender;
  tone: ScanDepth;
};

function price(value: string | number): string {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

/** One shop card in a tone group: the product page, plus a shortcut to the same item on the mannequin. */
export default function TonePickCard({ item, gender, tone }: Props) {
  const navigate = useNavigate();
  const colour = item.color_hex || item.display_hex || "#d4d4d8";

  return (
    <article
      data-testid={`tone-pick-${item.id}`}
      className="overflow-hidden rounded-2xl border border-brand-border/60 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => navigate(`/product/${item.id}`)}
        className="block w-full text-left"
        aria-label={`Open ${item.name}`}
      >
        <div className="aspect-[3/4] w-full bg-cream-base">
          <ProductImage src={item.image} alt={item.name} className="h-full w-full" />
        </div>
        <div className="p-4">
          <h4 className="line-clamp-2 min-h-10 text-sm font-black leading-snug text-brand-dark">{item.name}</h4>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-blue-800">{price(item.price)}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
                style={{ backgroundColor: colour }}
              />
              <span className="truncate">{item.color_name || "Colour"}</span>
            </span>
          </div>
        </div>
      </button>

      <div className="border-t border-slate-100 px-4 py-2.5">
        <button
          type="button"
          onClick={() => navigate(`/mannequin?gender=${gender}&skin=${mannequinSkin(tone)}`)}
          className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-brand-gold hover:text-blue-700"
        >
          <PersonStanding className="h-3.5 w-3.5" />
          Try on mannequin
        </button>
      </div>
    </article>
  );
}
