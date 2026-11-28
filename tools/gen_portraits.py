"""用 Gemini 生成武將厚塗畫像。
用法：GEMINI_API_KEY=... python3 tools/gen_portraits.py [武將名 ...]
不帶參數時只生成 img/portraits/ 尚缺的武將。外貌描述在 tools/portrait-prompts.json。
生成後記得把新名字加進 js/portraitlist.js。需要 Pillow。"""
import os, sys, json, base64, io, urllib.request, concurrent.futures as cf
from PIL import Image
MODEL = 'gemini-3.1-flash-image'
STYLE = ("Original character concept art, semi-realistic digital painting, head-and-shoulders bust portrait, "
"three-quarter view, square 1:1 composition, face centered in the upper half. "
"Soft painterly brushwork, detailed realistic face with warm dramatic side lighting and subtle rim light, "
"rich ornate embroidered costume with fine Han-dynasty patterns, "
"background is soft misty grey-blue clouds and smoke, muted and atmospheric. "
"Chinese Eastern Han dynasty (late 2nd century) historical setting. "
"No text, no letters, no watermark, no frame, no border, single person only.")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESC = json.load(open(os.path.join(ROOT, 'tools/portrait-prompts.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'img/portraits')

def gen(name):
    body = {"contents": [{"parts": [{"text": STYLE + " Character: " + DESC[name]}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    for _ in range(3):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
            for p in r["candidates"][0]["content"]["parts"]:
                if "inlineData" in p:
                    im = Image.open(io.BytesIO(base64.b64decode(p["inlineData"]["data"]))).convert('RGB')
                    im.resize((320, 320), Image.LANCZOS).save(f"{OUT}/{name}.webp", quality=82, method=6)
                    return name, 'ok'
        except Exception as e:
            err = e
    return name, 'FAIL'

if __name__ == '__main__':
    names = sys.argv[1:] or [n for n in DESC if not os.path.exists(f"{OUT}/{n}.webp")]
    with cf.ThreadPoolExecutor(6) as ex:
        for n, st in ex.map(gen, names): print(st, n)
