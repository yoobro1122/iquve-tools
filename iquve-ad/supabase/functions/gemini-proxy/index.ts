import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // DB에서 Gemini 키 + 모델 설정 조회
    const { data: rows, error } = await supabase
      .from("api_config")
      .select("key_name, key_value")
      .in("key_name", ["gemini_key", "gemini_text_model", "gemini_image_model"]);

    if (error) {
      return new Response(JSON.stringify({ error: "설정 조회 실패: " + error.message }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const cfg: Record<string, string> = {};
    (rows || []).forEach((r: { key_name: string; key_value: string }) => { cfg[r.key_name] = r.key_value; });

    if (!cfg.gemini_key) {
      return new Response(JSON.stringify({ error: "Gemini API 키가 설정되지 않았어요. Settings에서 키를 저장해주세요." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const geminiKey = cfg.gemini_key;
    // API 설정에서 모델명을 입력하지 않았으면 안전한 기본값 사용
    const textModel = cfg.gemini_text_model?.trim() || "gemini-2.5-flash";
    const imageModel = cfg.gemini_image_model?.trim() || "imagen-3.0-generate-002";
    const { type, payload } = await req.json();

    let url = "";
    if (type === "text") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${geminiKey}`;
    } else if (type === "image") {
      // imagen 계열은 :predict, gemini-*-image(Nano Banana) 계열은 :generateContent를 씁니다.
      const isNanoBanana = /flash-image|pro-image/.test(imageModel);
      url = isNanoBanana
        ? `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${geminiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${geminiKey}`;
    } else {
      throw new Error("type은 'text' 또는 'image' 여야 해요");
    }

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await geminiRes.json();
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
