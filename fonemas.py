import os
import re
import time
import json
import wave
from google import genai
from google.genai import types
from google.cloud import texttospeech
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# =====================================================================
# CONFIGURAÇÕES INICIAIS E CREDENCIAIS
# =====================================================================
# Credenciais do Google Cloud (TTS)
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "gcp_key.json"
# Chave da API do Gemini
os.environ["GEMINI_API_KEY"] = "AQ.Ab8RN6LbtmkBsa3qfeiv6DK_YnTRS9ITTA7lP82acwvaXyKpSw"

# Escopo necessário para criar pastas e subir arquivos no Drive
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Configuração das Vozes Premium
# pt-BR-Studio-A (Feminina) ou pt-BR-Studio-B (Masculina)
VOZ_PORTUGUES = {"language_code": "pt-BR", "name": "pt-BR-Neural2-A"}
# Voz Journey para sotaque americano perfeito
VOZ_INGLES = {"language_code": "en-US", "name": "en-US-Journey-F"}    

# =====================================================================
# O PROMPT MASTER (AGORA ORIENTADO A JSON)
# =====================================================================
PROMPT_MASTER = """
Atue como um especialista em fonética do inglês e professor de pronúncia para brasileiros.
O foco deste áudio é o fonema: {fonema_alvo}

Sua tarefa é retornar ESTRITAMENTE um objeto JSON válido, sem formatação markdown. 
O JSON deve conter exatamente 3 chaves:

1. "explicacao_pt": Uma explicação didática, em Português Brasileiro natural, sobre como produzir o som fisicamente detalhando: Glote (vozeado ou desvozeado), posição da língua, formato dos lábios e fluxo de ar. Termine convidando o aluno para praticar o shadowing.
2. "palavras_en": Uma lista de strings contendo exatamente 5 palavras de exemplo em inglês.
3. "conclusao_pt": Uma frase final de incentivo em Português Brasileiro (ex: "Excelente trabalho. Repita este exercício até que o movimento se torne natural.").
"""

LISTA_DE_FONEMAS = [
    "/p/ (ex: pen, stop)", "/b/ (ex: bad, cab)", "/t/ (ex: tea, cat)", "/d/ (ex: did, bad)",
    "/k/ (ex: cat, back)", "/g/ (ex: got, dog)", "/f/ (ex: fall, if)", "/v/ (ex: van, save)",
    "/θ/ - TH desvozeado (ex: thin, path)", "/ð/ - TH vozeado (ex: this, mother)",
    "/s/ (ex: see, less)", "/z/ (ex: zoo, goes)", "/ʃ/ (ex: shoe, wash)", "/ʒ/ (ex: vision, measure)",
    "/h/ (ex: hat, who)", "/tʃ/ (ex: chain, match)", "/dʒ/ (ex: jam, edge)", "/m/ (ex: man, some)",
    "/n/ (ex: now, ten)", "/ŋ/ (ex: sing, ring)", "/l/ (ex: leg, tell)", "/r/ (ex: red, try)",
    "/j/ (ex: yes, yellow)", "/w/ (ex: wet, window)",
    "/iː/ - Vogal Longa (ex: see, heat)", "/ɪ/ - Vogal Curta (ex: sit, hit)",
    "/ʊ/ - Vogal Curta (ex: put, look)", "/uː/ - Vogal Longa (ex: too, blue)",
    "/e/ ou /ɛ/ - Vogal Curta (ex: ten, bed)", "/ə/ - Schwa (ex: about, sofa)",
    "/ɜː/ ou /ɝ/ - Vogal Longa (ex: bird, nurse)", "/ɔː/ - Vogal Longa (ex: saw, door)",
    "/æ/ - Vogal Curta (ex: cat, black)", "/ʌ/ - Vogal Curta (ex: cup, mud)",
    "/ɑː/ - Vogal Longa (ex: father, car)", "/ɒ/ ou /ɑ/ - Vogal Curta (ex: hot, stop)",
    "/ɪə/ (ex: near, here)", "/eə/ (ex: hair, there)", "/ʊə/ (ex: pure, tour)",
    "/eɪ/ (ex: say, make)", "/aɪ/ (ex: five, high)", "/ɔɪ/ (ex: boy, join)",
    "/əʊ/ ou /oʊ/ (ex: go, home)", "/aʊ/ (ex: now, out)"
]

# =====================================================================
# INTEGRAÇÃO COM O GOOGLE DRIVE
# =====================================================================
def autenticar_drive():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0, host='127.0.0.1')
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('drive', 'v3', credentials=creds)

def obter_ou_criar_pasta_drive(service, nome_pasta):
    response = service.files().list(
        q=f"name='{nome_pasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        spaces='drive', fields='files(id, name)'
    ).execute()
    arquivos = response.get('files', [])
    if arquivos: return arquivos[0].get('id')
    pasta = service.files().create(body={'name': nome_pasta, 'mimeType': 'application/vnd.google-apps.folder'}, fields='id').execute()
    return pasta.get('id')

def obter_arquivos_existentes_drive(service, folder_id):
    arquivos = []
    page_token = None
    while True:
        response = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            spaces='drive', fields='nextPageToken, files(name)', pageToken=page_token
        ).execute()
        arquivos.extend([f.get('name') for f in response.get('files', [])])
        page_token = response.get('nextPageToken', None)
        if not page_token: break
    return arquivos

def upload_audio_drive(service, caminho_arquivo, folder_id):
    media = MediaFileUpload(caminho_arquivo, mimetype='audio/wav')
    service.files().create(body={'name': os.path.basename(caminho_arquivo), 'parents': [folder_id]}, media_body=media).execute()

# =====================================================================
# MOTORES DE INTELIGÊNCIA E ÁUDIO
# =====================================================================
def gerar_roteiro_json(fonema):
    client = genai.Client()
    prompt_formatado = PROMPT_MASTER.format(fonema_alvo=fonema)
    
    # Loop de tentativas para não quebrar no Free Tier
    for tentativa in range(3):
        try:
            response = client.models.generate_content(
                model='gemini-3.5-flash',
                contents=prompt_formatado,
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
            )
            return json.loads(response.text)
        except Exception as e:
            if "429" in str(e) or "503" in str(e):
                print(f"        [!] Servidor ocupado (Tentativa {tentativa+1}/3). Aguardando 60s...")
                time.sleep(60)
            else:
                raise e
    raise Exception("Falha ao gerar JSON no Gemini.")

def sintetizar_trecho(texto, configs_voz, nome_arquivo, is_ssml=False):
    client = texttospeech.TextToSpeechClient()
    
    # Se for a explicação (não SSML), injetamos energia na voz para não soar tão robótica
    if not is_ssml:
        texto_animado = f'<speak><prosody pitch="+1st" rate="105%">{texto}</prosody></speak>'
        input_data = texttospeech.SynthesisInput(ssml=texto_animado)
    else:
        input_data = texttospeech.SynthesisInput(ssml=texto)
        
    voice = texttospeech.VoiceSelectionParams(language_code=configs_voz["language_code"], name=configs_voz["name"])
    
    # 24000Hz LINEAR16 é obrigatório para que todos os áudios tenham a mesma taxa na hora de colar
    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.LINEAR16, sample_rate_hertz=24000)
    
    response = client.synthesize_speech(input=input_data, voice=voice, audio_config=audio_config)
    with open(nome_arquivo, "wb") as out:
        out.write(response.audio_content)
    return nome_arquivo

def juntar_wavs(lista_arquivos, arquivo_saida):
    """Costura vários arquivos WAV em um único arquivo, mantendo a qualidade."""
    # Encontra o primeiro arquivo existente para pegar os parâmetros base
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

# =====================================================================
# FLUXO PRINCIPAL
# =====================================================================
if __name__ == "__main__":
    pasta_local = "Audios_Fonemas_Temp"
    nome_pasta_drive = "Banco de Fonemas - FSRS"
    os.makedirs(pasta_local, exist_ok=True)
    
    print("\n[1] Autenticando no Google Drive...")
    drive_service = autenticar_drive()
    
    print("\n[2] Verificando Drive e sincronizando histórico...")
    pasta_drive_id = obter_ou_criar_pasta_drive(drive_service, nome_pasta_drive)
    arquivos_no_drive = obter_arquivos_existentes_drive(drive_service, pasta_drive_id)
    print(f"[*] Encontrados {len(arquivos_no_drive)} arquivos no Drive. O script irá pulá-los.\n")
    
    # Gera os arquivos de silêncio universais que usaremos na costura
    silencio_1s = os.path.join(pasta_local, "silence_1s.wav")
    silencio_3s = os.path.join(pasta_local, "silence_3s.wav")
    sintetizar_trecho('<speak><break time="1.0s"/></speak>', VOZ_PORTUGUES, silencio_1s, is_ssml=True)
    sintetizar_trecho('<speak><break time="3.0s"/></speak>', VOZ_PORTUGUES, silencio_3s, is_ssml=True)

    print(f"\n[3] Iniciando linha de montagem Studio Premium...\n")
    
    for i, fonema in enumerate(LISTA_DE_FONEMAS, start=1):
        try:
            nome_limpo = re.sub(r'[^a-zA-Z0-9]', '', fonema.split()[0])
            nome_arquivo_final = f"{i:02d}_{nome_limpo}.wav"
            caminho_final_local = os.path.join(pasta_local, nome_arquivo_final)
            
            # Pula se já estiver no Drive
            if nome_arquivo_final in arquivos_no_drive:
                print(f"[-] Pulando: {fonema} (Já concluído no Drive)")
                continue
                
            print(f"[*] Processando: {fonema}")
            roteiro = gerar_roteiro_json(fonema)
            fatias_audio = []
            arquivos_temporarios = [] # Para limpar no final do loop
            
            # 1. Grava a explicação em Português (Studio)
            intro_wav = os.path.join(pasta_local, "temp_intro.wav")
            sintetizar_trecho(roteiro['explicacao_pt'], VOZ_PORTUGUES, intro_wav)
            fatias_audio.extend([intro_wav, silencio_1s])
            arquivos_temporarios.append(intro_wav)
            
            # 2. Grava cada palavra em Inglês (Journey) e adiciona pausa longa
            for idx, palavra in enumerate(roteiro['palavras_en']):
                palavra_wav = os.path.join(pasta_local, f"temp_word_{idx}.wav")
                sintetizar_trecho(palavra, VOZ_INGLES, palavra_wav)
                fatias_audio.extend([palavra_wav, silencio_3s])
                arquivos_temporarios.append(palavra_wav)
                
            # 3. Grava a conclusão em Português (Studio)
            fim_wav = os.path.join(pasta_local, "temp_fim.wav")
            sintetizar_trecho(roteiro['conclusao_pt'], VOZ_PORTUGUES, fim_wav)
            fatias_audio.append(fim_wav)
            arquivos_temporarios.append(fim_wav)
            
            # 4. Costura todas as fatias no arquivo final
            juntar_wavs(fatias_audio, caminho_final_local)
            
            # 5. Envia o arquivo unificado para a nuvem
            print(f"    Subindo arquivo para o Drive...")
            upload_audio_drive(drive_service, caminho_final_local, pasta_drive_id)
            print(f"    [✓] Sucesso Absoluto!\n")
            
            # 6. Limpa o lixo local
            for temp in arquivos_temporarios:
                if os.path.exists(temp): os.remove(temp)
            if os.path.exists(caminho_final_local): os.remove(caminho_final_local)
            
            # Pausa estendida para garantir que não bateremos no limite do Free Tier (15 RPM)
            time.sleep(15) 
            
        except Exception as e:
            print(f"    [X] Erro Crítico ao processar {fonema}: {e}\n")
            
    # Limpa os silêncios no final da operação global
    if os.path.exists(silencio_1s): os.remove(silencio_1s)
    if os.path.exists(silencio_3s): os.remove(silencio_3s)
    
    print("Módulo de Fonemas finalizado com sucesso!")