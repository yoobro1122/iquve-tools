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
    // API 설정에서 모델명을 입력하지 않았으면 기본값 사용
    const textModel = cfg.gemini_text_model?.trim() || "gemini-3.5-flash";
    const imageModel = cfg.gemini_image_model?.trim() || "gemini-3-pro-image";
    const { type, payload } = await req.json();

    let url = "";
    if (type === "text") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${geminiKey}`;

      // 모델 세대에 따라 thinking 설정 방식이 다름:
      //  - Gemini 3.x 계열: thinkingLevel (문자열) 사용, thinkingBudget과 동시 지정 시 400 에러
      //  - Gemini 2.5 이전 계열: thinkingBudget (숫자, 0=끄기) 사용
      // 클라이언트가 이런 모델별 차이를 알 필요 없도록 여기서 자동으로 맞춰줍니다.
      // 클라이언트가 이미 thinkingConfig를 직접 지정했으면 그 값을 존중해서 건드리지 않습니다.
      payload.generationConfig = payload.generationConfig || {};
      if (!payload.generationConfig.thinkingConfig) {
        const isGemini3 = /^gemini-3/.test(textModel);
        payload.generationConfig.thinkingConfig = isGemini3
          ? { thinkingLevel: "low" }   // 3.x: 구조화된 JSON 생성엔 낮은 추론이면 충분
          : { thinkingBudget: 0 };     // 2.5 이하: thinking 완전히 끄기
      }
    } else if (type === "image") {
      // imagen 계열은 :predict, gemini-*-image(Nano Banana) 계열은 :generateContent를 씁니다.
      const isNanoBanana = /flash-image|pro-image/.test(imageModel);
      url = isNanoBanana
        ? `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${geminiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${geminiKey}`;
      if (isNanoBanana) {
        // Nano Banana 계열은 responseModalities 지정이 필요 (기본값: 텍스트+이미지)
        payload.generationConfig = payload.generationConfig || {};
        if (!payload.generationConfig.responseModalities) {
          payload.generationConfig.responseModalities = ["TEXT", "IMAGE"];
        }
      }
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
