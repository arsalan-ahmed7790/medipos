// Store/receipt settings: types + React Query hook backed by store_settings table.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaperWidth = "58mm" | "80mm";
export type FontSize = "small" | "medium" | "large";

export interface StoreSettings {
  id: string;
  store_name: string;
  address_line: string | null;
  phone: string | null;
  footer: string | null;
  paper_width: PaperWidth;
  font_size: FontSize;
  show_discount: boolean;
  show_unit_price: boolean;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  id: "default",
  store_name: "MEDICAL STORE",
  address_line: "123 Main St, City",
  phone: "+1 555 123 4567",
  footer: "Thank You — Get Well Soon!",
  paper_width: "80mm",
  font_size: "medium",
  show_discount: true,
  show_unit_price: true,
};

/** Character width per paper size for receipt text. */
export const widthChars = (w: PaperWidth) => (w === "58mm" ? 24 : 32);

/** CSS pixel width of receipt paper at ~96dpi. */
export const widthPx = (w: PaperWidth) => (w === "58mm" ? 220 : 302);

export const fontSizePx = (s: FontSize): number =>
  s === "small" ? 11 : s === "large" ? 14 : 12;

export function useSettings() {
  return useQuery({
    queryKey: ["store_settings"],
    queryFn: async (): Promise<StoreSettings> => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return {
        id: data.id,
        store_name: data.store_name,
        address_line: data.address_line,
        phone: data.phone,
        footer: data.footer,
        paper_width: (data.paper_width as PaperWidth) ?? "80mm",
        font_size: (data.font_size as FontSize) ?? "medium",
        show_discount: data.show_discount,
        show_unit_price: data.show_unit_price,
      };
    },
    staleTime: 60_000,
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<StoreSettings>) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ id: "default", ...s }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_settings"] }),
  });
}
