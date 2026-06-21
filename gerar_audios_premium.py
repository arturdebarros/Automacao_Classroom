import os
import json
import time
import wave
from google.cloud import texttospeech
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# Configurações do GCP
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "gcp_key.json"
SCOPES = ['https://www.googleapis.com/auth/drive.file']

VOZ_PORTUGUES = {"language_code": "pt-BR", "name": "pt-BR-Neural2-A"}
VOZ_INGLES = {"language_code": "en-US", "name": "en-US-Journey-F"}

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

def sintetizar_trecho(texto, configs_voz, nome_arquivo, is_ssml=False):
    client = texttospeech.TextToSpeechClient()
    
    # As vozes Journey não suportam SSML. Precisam de entrada de texto puro.
    if "Journey" in configs_voz["name"]:
        input_data = texttospeech.SynthesisInput(text=texto)
    elif not is_ssml:
        # A injeção de energia que tira o tom robótico da Neural2
        texto_animado = f'<speak><prosody pitch="+1st" rate="105%">{texto}</prosody></speak>'
        input_data = texttospeech.SynthesisInput(ssml=texto_animado)
    else:
        # SSML puro (para as pausas de silêncio)
        input_data = texttospeech.SynthesisInput(ssml=texto)
        
    voice = texttospeech.VoiceSelectionParams(language_code=configs_voz["language_code"], name=configs_voz["name"])
    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.LINEAR16, sample_rate_hertz=24000)
    
    response = client.synthesize_speech(input=input_data, voice=voice, audio_config=audio_config)
    with open(nome_arquivo, "wb") as out:
        out.write(response.audio_content)
    return nome_arquivo

def juntar_wavs(lista_arquivos, arquivo_saida):
    # Encontra o primeiro arquivo existente
    primeiro_valido = next((f for f in lista_arquivos if os.path.exists(f)), None)
    if not primeiro_valido:
        raise Exception("Nenhum arquivo WAV gerado para costura.")

    with wave.open(primeiro_valido, 'rb') as w_in:
        params = w_in.getparams()
    with wave.open(arquivo_saida, 'wb') as w_out:
        w_out.setparams(params)
        for arq in lista_arquivos:
            if os.path.exists(arq):
                with wave.open(arq, 'rb') as w:
                    w_out.writeframes(w.readframes(w.getnframes()))

if __name__ == "__main__":
    drive_service = autenticar_drive()
    
    # Substitua pelo ID da sua pasta "Banco de Fonemas - FSRS"
    pasta_id = "1dKrh6u_66MHJ9aGdzOpuJzEx6GK2H6SC"
    
    # Lê o arquivo JSON
    with open('roteiros.json', 'r', encoding='utf-8') as f:
        fonemas_data = json.load(f)

    silencio_1s = "silence_1s.wav"
    silencio_3s = "silence_3s.wav"
    sintetizar_trecho('<speak><break time="1.0s"/></speak>', VOZ_PORTUGUES, silencio_1s, is_ssml=True)
    sintetizar_trecho('<speak><break time="3.0s"/></speak>', VOZ_PORTUGUES, silencio_3s, is_ssml=True)

    for idx_fonema, item in enumerate(fonemas_data, start=1):
        try:
            nome_fonema = item['fonema'].replace("/", "").strip()
            print(f"[*] Gerando áudio premium para: {nome_fonema}")
            
            fatias = []
            # Explicação em PT (Neural2 animada)
            fatias.append(sintetizar_trecho(item['explicacao_pt'], VOZ_PORTUGUES, "t_intro.wav"))
            fatias.append(silencio_1s)
            
            # Palavras em Inglês (Journey)
            for i, pal in enumerate(item['palavras_en']):
                fatias.append(sintetizar_trecho(pal, VOZ_INGLES, f"t_word_{i}.wav"))
                fatias.append(silencio_3s)
                
            # Conclusão em PT (Neural2 animada)
            fatias.append(sintetizar_trecho(item['conclusao_pt'], VOZ_PORTUGUES, "t_fim.wav"))
            
            # Costura
            arquivo_final = f"{idx_fonema:02d}_{nome_fonema}.wav"
            juntar_wavs(fatias, arquivo_final)
            
            # Upload
            media = MediaFileUpload(arquivo_final, mimetype='audio/wav')
            drive_service.files().create(body={'name': arquivo_final, 'parents': [pasta_id]}, media_body=media).execute()
            
            print(f"    [✓] {arquivo_final} enviado ao Drive com sucesso!")
            
            # Limpeza
            for fatia in set(fatias): # Usa set() para não tentar deletar os silêncios repetidos várias vezes
                if "silence" not in fatia and os.path.exists(fatia): 
                    os.remove(fatia)
            if os.path.exists(arquivo_final): 
                os.remove(arquivo_final)
                
        except Exception as e:
            print(f"    [X] Erro ao processar o fonema {item['fonema']}: {e}")

    # Limpeza dos silêncios no final
    if os.path.exists(silencio_1s): os.remove(silencio_1s)
    if os.path.exists(silencio_3s): os.remove(silencio_3s)