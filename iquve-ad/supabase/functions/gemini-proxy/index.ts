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

    // DB에서 Gemini 키 조회
    const { data, error } = await supabase
      .from("api_config")
      .select("key_value")
      .eq("key_name", "gemini_key")
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Gemini API 키가 설정되지 않았어요. Settings에서 키를 저장해주세요." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const geminiKey = data.key_value;
    const { type, payload } = await req.json();

    let url = "";
    if (type === "text") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
    } else if (type === "image") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${geminiKey}`;
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
