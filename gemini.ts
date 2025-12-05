import { GEMINI_KEY } from '@env';
import { Alert } from 'react-native'; // Added Alert for consistency with other files

/**
 * Identify the main ingredient in an image using Gemini Vision.
 * Accepts a base64-encoded jpeg string (no data: prefix).
 */
export type GeminiLabel = { name: string; confidence?: number };
export type GeminiResult = { primary: string | null; labels: GeminiLabel[] };

export default async function identifyMainIngredient(base64jpeg: string): Promise<GeminiResult | null> {
  if (!GEMINI_KEY) {
    Alert.alert('Gemini API Key Missing', 'Please provide a GEMINI_KEY in your environment variables.');
    console.error('Gemini API Key Missing for image analysis');
    return null;
  }

  const MAX_MODEL_TRIES = 3;
  const prompt = `You are an image understanding assistant. Given an inline base64 JPEG, return a JSON object with the following shape:\n{ "primary": "<one-word primary ingredient or null>", "labels": [{"name":"label","confidence":0.0}, ...] }\nOnly return the JSON object, nothing else.`;
  const preferredModels = [
    'models/gemini-pro-vision', // Vision model
    'models/gemini-flash-latest',
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
  ];

  let candidates: string[] = preferredModels;
  // NOTE: For simplicity, the advanced model discovery from `fetchAvailableGenerateModels` is omitted here.
  // If you require dynamic model selection, you might want to re-integrate that logic.

  let lastError: any = null;
  for (let i = 0; i < Math.min(candidates.length, MAX_MODEL_TRIES); i++) {
    const model = candidates[i];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64jpeg } }
          ] }]
        }),
      });

      const json = await res.json();
      if (__DEV__) {
        try { console.log(`Gemini raw response (model=${model}):`, JSON.stringify(json)); } catch (e) { console.log('Gemini raw response (could not stringify)', json); }
      }

      if (json && json.error) {
        const msg = json.error.message || JSON.stringify(json.error);
        if (__DEV__) console.warn(`Gemini API error for model ${model}:`, msg);
        lastError = new Error(`Gemini API error: ${msg}`);
        continue;
      }

      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = new Error('No textual content returned from model');
        continue;
      }

      const m = text.match(/\{[\s\S]*\}/);
      if (!m) {
        lastError = new Error('No JSON object found in model output');
        continue;
      }

      try {
        const parsed = JSON.parse(m[0]);
        const primary = (parsed.primary && String(parsed.primary).toLowerCase()) || null;
        const labels: GeminiLabel[] = Array.isArray(parsed.labels)
          ? parsed.labels.map((l: any) => ({ name: String(l.name).toLowerCase(), confidence: typeof l.confidence === 'number' ? l.confidence : undefined }))
          : (primary ? [{ name: primary }] : []);
        return { primary, labels };
      } catch (e) {
        if (__DEV__) console.warn('Failed to parse Gemini JSON response', e, text);
        lastError = e;
        continue;
      }
    } catch (e) {
      if (__DEV__) console.error(`Gemini request failed for model ${model}`, e);
      lastError = e;
    }
  }

  if (lastError) {
    throw new Error(`Gemini failed after trying ${Math.min(candidates.length, MAX_MODEL_TRIES)} models: ${lastError.message || String(lastError)}`);
  }
  return null;
}

/**
 * Sends a text-only prompt to the Gemini API and returns the generated text.
 * Suitable for tasks like rewriting recipe steps.
 */
export async function geminiTextPrompt(textPrompt: string): Promise<string | null> {
  if (!GEMINI_KEY) {
    Alert.alert('Gemini API Key Missing', 'Please provide a GEMINI_KEY in your environment variables.');
    console.error('Gemini API Key Missing for text prompt');
    return null;
  }

  const MAX_MODEL_TRIES = 3;
  // Prioritize text-focused models for text prompts
  const preferredTextModels = ['models/gemini-flash-latest', 'models/gemini-pro-latest', 'models/gemini-2.5-flash'];

  let candidates: string[] = preferredTextModels;

  let lastError: any = null;
  for (let i = 0; i < Math.min(candidates.length, MAX_MODEL_TRIES); i++) {
    const model = candidates[i];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: textPrompt }] }]
        }),
      });

      const json = await res.json();
      if (__DEV__) {
        try { console.log(`Gemini Text raw response (model=${model}):`, JSON.stringify(json)); } catch (e) { console.log('Gemini Text raw response (could not stringify)', json); }
      }

      if (json && json.error) {
        const msg = json.error.message || JSON.stringify(json.error);
        if (__DEV__) console.warn(`Gemini API error for text model ${model}:`, msg);
        lastError = new Error(`Gemini API error: ${msg}`);
        continue;
      }
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text.trim();
      }
    } catch (e) {
      if (__DEV__) console.error(`Gemini text request failed for model ${model}`, e);
      lastError = e;
    }
  }
  if (lastError) {
    throw new Error(`Gemini text prompt failed after trying ${Math.min(candidates.length, MAX_MODEL_TRIES)} models: ${lastError.message || String(lastError)}`);
  }
  return null;
}