import os
import json
import re
import asyncio
from google import genai
from google.genai import types
from pydub import AudioSegment
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Configuração Drive
SCOPES = ['https://www.googleapis.com/auth/drive.file']
PASTA_ID = "1dKrh6u_66MHJ9aGdzOpuJzEx6GK2H6SC"

# Cliente Gemini (Certifique-se de ter a variável de ambiente GEMINI_API_KEY definida)
client = genai.Client(api_key=os.getenv("AQ.Ab8RN6LbtmkBsa3qfeiv6DK_YnTRS9ITTA7lP82acwvaXyKpSw"))

def autenticar_drive():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('drive', 'v3', credentials=creds)

async def gerar_audio_gemini(texto, arquivo_saida):
    """Gera áudio usando a performance natural do Gemini TTS Preview."""
    response = client.models.generate_content(
        model='gemini-3.1-flash-tts-preview',
        contents=f"Aja como um professor de pronúncia. Leia com calma e clareza: {texto}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck"))
            )
        )
    )
    # Grava o áudio recebido
    with open(arquivo_saida, "wb") as f:
        f.write(response.audio_bytes)
    return arquivo_saida

async def processar():
    drive_service = autenticar_drive()
    with open('roteiros.json', 'r', encoding='utf-8') as f:
        fonemas = json.load(f) #

    for idx, item in enumerate(fonemas, start=1):
        nome_fonema = item['id_fonema']
        arquivo_final = f"{idx:02d}_{nome_fonema}.wav"
        print(f"[*] Processando: {item['simbolo_ipa']}")

        # 1. Limpeza do roteiro
        roteiro = re.sub(r'/[^/]+/', '', item['roteiro_ssml']).replace("Excelente.", "").strip()
        partes = roteiro.split("shadowing:")
        explicacao = partes[0].strip()

        # 2. Gera explicação (Intro)
        await gerar_audio_gemini(explicacao, "intro.wav")
        trilha = AudioSegment.from_wav("intro.wav") + AudioSegment.silent(duration=1500)

        # 3. Gera palavras com pausa de 4s
        for pal in item['palavras_escolhidas']:
            await gerar_audio_gemini(pal, "pal.wav")
            trilha += AudioSegment.from_wav("pal.wav") + AudioSegment.silent(duration=4000)

        # 4. Finaliza e Upload
        trilha.export(arquivo_final, format="wav")
        
        with open(arquivo_final, 'rb') as f_audio:
            media = MediaIoBaseUpload(f_audio, mimetype='audio/wav')
            drive_service.files().create(
                body={'name': arquivo_final, 'parents': [PASTA_ID]}, 
                media_body=media
            ).execute()
        
        print(f"    [✓] {arquivo_final} enviado ao Drive.")
        
        # Limpeza
        for f in ["intro.wav", "pal.wav", arquivo_final]:
            if os.path.exists(f): os.remove(f)

if __name__ == "__main__":
    asyncio.run(processar())