import asyncio
import edge_tts
import argparse
import json
import sys

async def list_voices():
    try:
        voices = await edge_tts.VoicesManager.create()
        english_voices = []
        for voice in voices.voices:
            # We filter for English locales by default to keep the UI clean
            if "en-" in voice["Locale"].lower():
                english_voices.append({
                    "Name": voice["Name"],
                    "ShortName": voice["ShortName"],
                    "Gender": voice["Gender"],
                    "Locale": voice["Locale"],
                    "FriendlyName": f"{voice['FriendlyName']} ({voice['Gender']})"
                })
        # Sort voices alphabetically by friendly name
        english_voices.sort(key=lambda x: x["FriendlyName"])
        print(json.dumps(english_voices))
    except Exception as e:
        print(json.dumps([
            {"ShortName": "en-US-GuyNeural", "FriendlyName": "Microsoft Guy (Male)", "Gender": "Male"},
            {"ShortName": "en-US-JennyNeural", "FriendlyName": "Microsoft Jenny (Female)", "Gender": "Female"},
            {"ShortName": "en-US-AriaNeural", "FriendlyName": "Microsoft Aria (Female)", "Gender": "Female"},
            {"ShortName": "en-GB-SoniaNeural", "FriendlyName": "Microsoft Sonia (Female)", "Gender": "Female"},
            {"ShortName": "en-GB-RyanNeural", "FriendlyName": "Microsoft Ryan (Male)", "Gender": "Male"}
        ]))

async def generate_tts(text, voice, output):
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output)
        print(json.dumps({"success": True, "path": output}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Edge TTS Generator Helper")
    parser.add_argument("--text", help="Text to convert to speech")
    parser.add_argument("--voice", default="en-US-GuyNeural", help="Voice model short name")
    parser.add_argument("--output", help="Output path for the generated audio (.mp3)")
    parser.add_argument("--list", action="store_true", help="List available English voices in JSON format")
    args = parser.parse_args()
    
    if args.list:
        asyncio.run(list_voices())
    elif args.text and args.output:
        asyncio.run(generate_tts(args.text, args.voice, args.output))
    else:
        print(json.dumps({"success": False, "error": "Invalid arguments. Provide --text and --output, or --list"}))
        sys.exit(1)
