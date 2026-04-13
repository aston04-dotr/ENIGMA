"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { useAuth } from "@/context/auth-context";
import { fetchListingById } from "@/lib/listings";
import { supabase } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

// Toast component
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-[#22c55e]" : type === "error" ? "bg-danger" : "bg-accent";
  
  return (
    <div className={`fixed top-4 left-4 right-4 z-50 ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg animate-fade-in`}>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

const inputClass =
  "w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-fg placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/35 transition-all duration-200";

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const { session, authResolved, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalData, setOriginalData] = useState<{ title: string; description: string; price: number } | null>(null);

  useEffect(() => {
    if (!authResolved || authLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!id) return;
    
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchListingById(String(id));
        if (cancelled) return;
        
        if (!res.row) {
          setErr(res.loadError ?? "Объявление не найдено");
          setLoading(false);
          return;
        }
        
        // Verify ownership
        if (res.row.user_id !== session.user.id) {
          setErr("Вы можете редактировать только свои объявления");
          setLoading(false);
          return;
        }
        
        setTitle(res.row.title);
        setDescription(res.row.description);
        setPrice(String(res.row.price));
        setOriginalData({
          title: res.row.title,
          description: res.row.description,
          price: res.row.price,
        });
      } catch (e) {
        console.error("FETCH ERROR", e);
        setErr("Не удалось загрузить объявление");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    
    return () => { cancelled = true; };
  }, [id, session, authResolved, authLoading, router]);

  async function save() {
    if (!session?.user || !id) return;
    
    const titleTrim = title.trim();
    const descriptionTrim = description.trim();
    const priceNum = Number(price);
    
    if (!titleTrim) {
      setToast({ message: "Введите название", type: "error" });
      return;
    }
    if (!descriptionTrim) {
      setToast({ message: "Введите описание", type: "error" });
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setToast({ message: "Введите корректную цену", type: "error" });
      return;
    }
    
    setSaving(true);
    
    const { error } = await supabase
      .from("listings")
      .update({
        title: titleTrim,
        description: descriptionTrim,
        price: priceNum,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", session.user.id);
    
    if (error) {
      console.error("UPDATE ERROR", error);
      setToast({ message: "Не удалось сохранить изменения", type: "error" });
      setSaving(false);
      return;
    }
    
    setToast({ message: "✓ Объявление обновлено", type: "success" });
    setSaving(false);
    
    // Update original data
    setOriginalData({
      title: titleTrim,
      description: descriptionTrim,
      price: priceNum,
    });
  }

  const hasChanges = originalData && (
    title.trim() !== originalData.title ||
    description.trim() !== originalData.description ||
    Number(price) !== originalData.price
  );

  if (authLoading || !authResolved) {
    return <AuthLoadingScreen />;
  }
  
  if (loading) {
    return (
      <main className="safe-pt px-5 pb-8 pt-8">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-skeleton rounded bg-elev-2" />
          <div className="h-12 w-full animate-skeleton rounded bg-elev-2" />
          <div className="h-32 w-full animate-skeleton rounded bg-elev-2" />
          <div className="h-12 w-full animate-skeleton rounded bg-elev-2" />
        </div>
      </main>
    );
  }
  
  if (err) {
    return (
      <main className="safe-pt px-5 pb-8 pt-8">
        <p className="text-danger">{err}</p>
        <button
          onClick={() => router.push("/profile")}
          className="mt-4 text-accent hover:text-accent-hover"
        >
          ← Вернуться в профиль
        </button>
      </main>
    );
  }

  return (
    <main className="safe-pt px-5 pb-8 pt-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-muted hover:text-fg transition-colors"
        >
          ←
        </button>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Редактировать</h1>
      </div>
      
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Название</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Например: iPhone 14 Pro"
            disabled={saving}
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[120px] py-3 resize-none`}
            placeholder="Опишите товар подробнее..."
            rows={4}
            disabled={saving}
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Цена (₽)</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
            placeholder="0"
            type="number"
            inputMode="numeric"
            disabled={saving}
          />
        </div>
        
        <button
          type="button"
          disabled={saving || !hasChanges}
          onClick={() => void save()}
          className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[17px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20 mt-4"
        >
          {saving ? "Сохранение…" : hasChanges ? "Сохранить изменения" : "Нет изменений"}
        </button>
        
        <button
          type="button"
          onClick={() => router.push(`/listing/${id}`)}
          className="w-full min-h-[48px] rounded-card border border-line py-3 text-[15px] font-medium text-muted transition-all duration-200 hover:bg-elevated"
        >
          Отмена
        </button>
      </div>
    </main>
  );
}
