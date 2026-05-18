from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import edge_tts
import asyncio
import os
import uuid
import glob

app = Flask(__name__)
CORS(app)

# Ensure static folder exists
STATIC_FOLDER = os.path.join(os.getcwd(), 'static')
if not os.path.exists(STATIC_FOLDER):
    os.makedirs(STATIC_FOLDER)

@app.route('/static/<path:filename>')
def serve_static(filename):
    response = send_from_directory(STATIC_FOLDER, filename)
    # Disable caching for static files to ensure fresh audio load
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response

@app.route('/tts', methods=['POST'])
def tts_endpoint():
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    # 1. Cleanup old speech files to prevent disk bloat
    # We remove any file starting with 'speech_'
    try:
        files = glob.glob(os.path.join(STATIC_FOLDER, 'speech_*.mp3'))
        for f in files:
            try:
                os.remove(f)
            except Exception:
                pass # If file is locked/in-use, skip it
    except Exception as e:
        print(f"Cleanup warning: {e}")

    # 2. Generate Unique Filename
    # This prevents browser caching collisions and file locking issues
    filename = f"speech_{uuid.uuid4().hex}.mp3"
    output_file = os.path.join(STATIC_FOLDER, filename)
    
    # 3. Select Voice
    voice = 'en-US-AnaNeural'

    async def _run_tts():
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_file)

    try:
        # Await the TTS generation properly
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        loop.run_until_complete(_run_tts())
        
        # Return the relative URL for the frontend to fetch
        return jsonify({'url': f'/static/{filename}'})
    except Exception as e:
        print(f"TTS Generation Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(">> Starting TTS Backend on Port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
