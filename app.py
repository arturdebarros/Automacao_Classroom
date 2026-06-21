import os
import random
import wave
import time
import re
from google import genai
from google.genai import types
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.cloud import texttospeech

# Imports do ReportLab para a criação do PDF padrão Oxford
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# =====================================================================
# CONFIGURAÇÕES INICIAIS
# =====================================================================
os.environ["GEMINI_API_KEY"] = "AQ.Ab8RN6LbtmkBsa3qfeiv6DK_YnTRS9ITTA7lP82acwvaXyKpSw"

# Aponta para o arquivo JSON que você acabou de baixar e colocar na pasta
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "gcp_key.json"

SCOPES = [
    'https://www.googleapis.com/auth/classroom.coursework.students', 
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/drive.file'
]

# Catálogo de Vozes Premium do Google Cloud (Neural2 e Journey)
VOZES_MASCULINAS = [
    {"language_code": "en-US", "name": "en-US-Journey-D"}, # Americano (Voz Expressiva/Journey)
    {"language_code": "en-US", "name": "en-US-Neural2-J"}, # Americano
    {"language_code": "en-GB", "name": "en-GB-Neural2-B"}, # Britânico
    {"language_code": "en-AU", "name": "en-AU-Neural2-B"}  # Australiano
]
VOZES_FEMININAS = [
    {"language_code": "en-US", "name": "en-US-Journey-F"}, # Americana (Voz Expressiva/Journey)
    {"language_code": "en-US", "name": "en-US-Neural2-C"}, # Americana
    {"language_code": "en-GB", "name": "en-GB-Neural2-A"}, # Britânica
    {"language_code": "en-AU", "name": "en-AU-Neural2-C"}  # Australiana
]
# =====================================================================

def autenticar_google():
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
    return creds

def gerar_audio_dialogo_gcp(texto_dialogo, nome_arquivo="listening_audio.wav"):
    """Gera o áudio usando Google Cloud TTS com suporte a SSML."""
    client = texttospeech.TextToSpeechClient()
    
    voz_homem = random.choice(VOZES_MASCULINAS)
    voz_mulher = random.choice(VOZES_FEMININAS)
    
    linhas = texto_dialogo.strip().split('\n')
    arquivos_temporarios = []
    contador = 0

    print("[*] Enviando roteiro para a nuvem do Google Cloud TTS...")

    try:
        for linha in linhas:
            linha_limpa = linha.strip()
            if not linha_limpa:
                continue
                
            voz_escolhida = voz_homem
            if '(MALE):' in linha_limpa.upper():
                voz_escolhida = voz_homem
            elif '(FEMALE):' in linha_limpa.upper():
                voz_escolhida = voz_mulher

            # Corta o nome para mandar apenas a fala e as tags SSML para a nuvem
            if ':' in linha_limpa:
                texto_fala = linha_limpa.split(':', 1)[1].strip()
            else:
                texto_fala = linha_limpa.strip()
            
            if not texto_fala:
                continue

            # Monta o pacote no padrão SSML exigido pelo Google
            synthesis_input = texttospeech.SynthesisInput(ssml=f"<speak>{texto_fala}</speak>")
            
            voice = texttospeech.VoiceSelectionParams(
                language_code=voz_escolhida["language_code"],
                name=voz_escolhida["name"]
            )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16, # LINEAR16 = Arquivo WAV
                sample_rate_hertz=24000
            )
            
            response = client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )

            temp_file = f"temp_{contador}.wav"
            with open(temp_file, "wb") as out:
                out.write(response.audio_content)
                
            arquivos_temporarios.append(temp_file)
            contador += 1

        if not arquivos_temporarios:
            return None

        print(f"[*] Mesclando {len(arquivos_temporarios)} trechos da nuvem em um único arquivo de áudio...")
        
        with wave.open(arquivos_temporarios[0], 'rb') as wav_in:
            params = wav_in.getparams()
            with wave.open(nome_arquivo, 'wb') as wav_out:
                wav_out.setparams(params)
                for temp_wav in arquivos_temporarios:
                    with wave.open(temp_wav, 'rb') as w:
                        wav_out.writeframes(w.readframes(w.getnframes()))

    finally:
        for temp_file in arquivos_temporarios:
            if os.path.exists(temp_file):
                os.remove(temp_file)
                
    return nome_arquivo

def upload_para_drive(drive_service, nome_arquivo, mime_type):
    file_metadata = {'name': nome_arquivo, 'mimeType': mime_type}
    media = MediaFileUpload(nome_arquivo, mimetype=mime_type)
    arquivo_drive = drive_service.files().create(
        body=file_metadata, media_body=media, fields='id'
    ).execute()
    return arquivo_drive.get('id')

def limpar_tags_dinamicas(texto):
    """Remove marcações extras, deixando o texto limpo e legível para o aluno."""
    # Remove as tags MALE/FEMALE
    texto_limpo = re.sub(r'\s*\(MALE\)\s*:', ':', texto, flags=re.IGNORECASE)
    texto_limpo = re.sub(r'\s*\(FEMALE\)\s*:', ':', texto_limpo, flags=re.IGNORECASE)
    # Remove as marcações de áudio SSML (como <break time="500ms"/>) do PDF e Classroom
    texto_limpo = re.sub(r'<[^>]+>', '', texto_limpo)
    return texto_limpo

def gerar_pdf_didatico(info_turma, tema, secoes, nome_pdf="Student_Book.pdf"):
    doc = SimpleDocTemplate(
        nome_pdf,
        pagesize=letter,
        rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    PRIMARY_COLOR = colors.HexColor("#0F2C59")
    TEXT_COLOR = colors.HexColor("#1A1A1A")
    
    title_style = ParagraphStyle(
        'OxfordTitle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=24, leading=28,
        textColor=PRIMARY_COLOR, spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'OxfordSubtitle', parent=styles['Normal'],
        fontName='Helvetica-Oblique', fontSize=10, leading=14,
        textColor=colors.HexColor("#555555"), spaceAfter=20
    )
    h2_style = ParagraphStyle(
        'OxfordH2', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=16, leading=20,
        textColor=PRIMARY_COLOR, spaceBefore=15, spaceAfter=10
    )
    body_style = ParagraphStyle(
        'OxfordBody', parent=styles['Normal'],
        fontName='Helvetica', fontSize=11, leading=16,
        textColor=TEXT_COLOR, spaceAfter=10
    )
    
    story = []
    
    story.append(Paragraph(f"UNIT MATERIAL: {tema.upper()}", title_style))
    story.append(Paragraph(f"Course: {info_turma['nome']} | Level: {info_turma['nivel']}", subtitle_style))
    story.append(Paragraph("PART 1: READING COMPREHENSION", h2_style))
    
    partes_reading = secoes['reading'].strip().split('GLOSSARY:')
    corpo_reading = partes_reading[0].strip()
    
    for p in corpo_reading.split('\n'):
        if p.strip():
            story.append(Paragraph(p.strip(), body_style))
            
    if len(partes_reading) > 1:
        story.append(Spacer(1, 15))
        story.append(Paragraph("GLOSSARY", h2_style))
        for item in partes_reading[1].strip().split('\n'):
            if item.strip():
                story.append(Paragraph(f"• {item.strip()}", body_style))
                
    story.append(PageBreak())
    
    story.append(Paragraph("PART 2: LISTENING PRACTICE", h2_style))
    story.append(Paragraph("Listen to the audio track attached in your Classroom and follow the script below:", subtitle_style))
    
    dialogo_limpo = limpar_tags_dinamicas(secoes['listening'])
    for linha in dialogo_limpo.split('\n'):
        if linha.strip():
            story.append(Paragraph(linha.strip(), body_style))
            
    story.append(PageBreak())
    
    story.append(Paragraph("PART 3: WRITING CHALLENGE", h2_style))
    for linha in secoes['writing'].split('\n'):
        if midline := linha.strip():
            story.append(Paragraph(midline, body_style))
            
    doc.build(story)
    return nome_pdf

def obter_ids_topicos(service, course_id):
    resposta = service.courses().topics().list(courseId=course_id).execute()
    topicos_existentes = resposta.get('topic', [])
    mapa_topicos = {t['name'].strip().lower(): t['topicId'] for t in topicos_existentes}
    nomes_padrao = ['reading', 'listening', 'writing']
    ids_finais = {}
    
    for padrao in nomes_padrao:
        if padrao in mapa_topicos:
            ids_finais[padrao] = mapa_topicos[padrao]
        else:
            novo = service.courses().topics().create(
                courseId=course_id, body={'name': padrao.capitalize()}
            ).execute()
            ids_finais[padrao] = novo['topicId']
    return ids_finais

def rodar_fluxo_automacao(info_turma, tema):
    print(f"\n[1/4] Solicitando ao Gemini a geração do material para: {info_turma['nome']}...")
    ai_client = genai.Client()
    
    system_instruction = (
        f"Você é um professor nativo de inglês especialista em metodologia personalizada.\n"
        f"Gere um kit de aula adaptado EXATAMENTE ao seguinte perfil de aluno:\n"
        f"- Nível de Proficiência: {info_turma['nivel']}\n"
        f"- Objetivo e Foco Temático: {info_turma['foco']}\n\n"
        f"REGRA OBRIGATÓRIA DE SEPARAÇÃO:\n"
        f"Você deve dividir a sua resposta usando EXATAMENTE as três tags abaixo em letras maiúsculas e entre colchetes. Não coloque nada antes da primeira tag.\n\n"
        f"[READING]\n"
        f"Crie um texto original sobre o tema. OBRIGATÓRIO: O texto deve ter no mínimo 250 palavras e no máximo 300 palavras. Vocabulário nível {info_turma['nivel']}. Foco em {info_turma['foco']}. Adicione um 'GLOSSARY' no final contendo OBRIGATORIAMENTE no mínimo 20 palavras traduzidas.\n\n"
        f"[LISTENING]\n"
        f"Escreva OBRIGATORIAMENTE o roteiro de um DIÁLOGO dinâmico simulando uma situação de {info_turma['foco']}. OBRIGATÓRIO: O roteiro deve ter no mínimo 250 palavras e no máximo 300 palavras.\n"
        f"REGRA ESTRITA DE FORMATAÇÃO E NOMES DO DIÁLOGO: Escolha nomes reais e variados para os dois personagens (um homem e uma mulher). Cada linha de fala deve começar OBRIGATORIAMENTE com o Nome do personagem escolhido seguido da tag de gênero '(MALE):' ou '(FEMALE):'.\n"
        f"REGRAS DE NATURALIDADE (SSML PARA A NUVEM DO GOOGLE):\n"
        f"O diálogo será gerado pelo Google Cloud TTS em SSML. O roteiro DEVE soar como fala humana real:\n"
        f"1. Insira respiros ou pausas teatrais usando estritamente a tag <break time=\"500ms\"/> (você pode variar os milissegundos para 300ms, 800ms, etc).\n"
        f"2. Insira fillers conversacionais (ex: 'Well...', 'Oh, wow!', 'Hmm').\n"
        f"3. Use linguagem coloquial e contrações (ex: 'gonna', 'wanna', 'didn't').\n"
        f"Exemplo de formato obrigatório:\n"
        f"John (MALE): Well <break time=\"400ms\"/> I was just thinking about our trip. It's gonna be amazing, right?\n"
        f"Emily (FEMALE): Oh, absolutely! I just <break time=\"800ms\"/> haven't even started packing yet.\n\n"
        f"[WRITING]\n"
        f"Adicione 3 perguntas de compreensão sobre o áudio acima. Em seguida, crie um desafio prático de escrita (60 a 100 palavras) com 'Useful Phrases' e exemplo de resposta.\n\n"
        f"MUITO IMPORTANTE: Entregue TEXTO PURO. NÃO use formatação Markdown (nunca use asteriscos ** para negrito ou hashtags #). Use apenas letras MAIÚSCULAS para destacar títulos e pule linhas para manter o visual limpo."
    )
    
    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=f"Tema da aula solicitado: {tema}",
        config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.3)
    )
    conteudo_gerado = response.text

    print("\n=====================================================================")
    print("                      CONTEÚDO GERADO PARA REVISÃO                   ")
    print("=====================================================================")
    print(limpar_tags_dinamicas(conteudo_gerado))
    print("=====================================================================\n")
    
    confirmacao = input("\nVocê aprova o texto acima? Digite 'sim' para continuar ou 'nao' para cancelar: ").strip().lower()
    if confirmacao != 'sim':
        print("\n[X] Operação cancelada.")
        return

    print("\n[2/4] Autenticando com Google e mapeando tópicos...")
    creds = autenticar_google()
    classroom_service = build('classroom', 'v1', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)
    ids_topicos = obter_ids_topicos(classroom_service, info_turma['id'])
    
    secoes = {"reading": "", "listening": "", "writing": ""}
    secao_atual = None
    for linha in conteudo_gerado.split('\n'):
        linha_limpa = linha.strip().upper()
        if "[READING]" in linha_limpa:
            secao_atual = "reading"
            continue
        elif "[LISTENING]" in linha_limpa:
            secao_atual = "listening"
            continue
        elif "[WRITING]" in linha_limpa:
            secao_atual = "writing"
            continue
        if secao_atual:
            secoes[secao_atual] += linha + "\n"

    print("\n[*] Diagramando Livro Didático Digital em PDF (Padrão Oxford)...")
    nome_pdf_local = f"{tema.replace(' ', '_')}_Workbook.pdf"
    gerar_pdf_didatico(info_turma, tema, secoes, nome_pdf=nome_pdf_local)
    
    print("[*] Fazendo upload do Workbook para o Google Drive...")
    pdf_drive_id = upload_para_drive(drive_service, nome_pdf_local, 'application/pdf')
    os.remove(nome_pdf_local)

    audio_drive_id = None
    if secoes['listening'].strip():
        print("\n[3/4] Gravando o diálogo na nuvem do Google Cloud TTS e salvando no Drive...")
        try:
            nome_customizado = f"{tema.replace(' ', '_')}_Audio.wav"
            nome_wav = gerar_audio_dialogo_gcp(secoes['listening'].strip(), nome_arquivo=nome_customizado)
            audio_drive_id = upload_para_drive(drive_service, nome_wav, 'audio/wav')
            os.remove(nome_wav)
            print("[✓] Áudio renderizado e salvo no Drive em tempo recorde!")
        except Exception as e:
            print(f"\n[X] ALERTA: Erro no áudio da nuvem: {e}")
            input("-> Pressione ENTER para continuar e postar a aula SEM o áudio...")

    print("\n[4/4] Enviando fatias para o Classroom...")
    for habilidade in ['reading', 'listening', 'writing']:
        texto_habilidade = secoes[habilidade].strip()
        if not texto_habilidade:
            continue
            
        if habilidade == 'listening':
            texto_habilidade = limpar_tags_dinamicas(texto_habilidade)
            
        tarefa_body = {
            'title': tema,
            'description': texto_habilidade,
            'workType': 'ASSIGNMENT',
            'state': 'PUBLISHED',
            'topicId': ids_topicos[habilidade]
        }
        
        if habilidade == 'reading' and pdf_drive_id:
            tarefa_body['materials'] = [{'driveFile': {'driveFile': {'id': pdf_drive_id}, 'shareMode': 'VIEW'}}]
            tarefa_body['description'] = "DOWNLOAD YOUR PRINTABLE WORKBOOK ATTACHED BELOW.\n\n" + tarefa_body['description']
        
        if habilidade == 'listening' and audio_drive_id:
            tarefa_body['materials'] = [{'driveFile': {'driveFile': {'id': audio_drive_id}, 'shareMode': 'VIEW'}}]
            tarefa_body['description'] = "PLEASE LISTEN TO THE ATTACHED AUDIO AND TAKE NOTES.\n\n" + tarefa_body['description']
        
        try:
            classroom_service.courses().courseWork().create(courseId=info_turma['id'], body=tarefa_body).execute()
            print(f"[✓] Postado com sucesso no tópico: {habilidade.capitalize()}")
        except Exception as e:
            print(f"[X] Erro ao postar no tópico {habilidade.capitalize()}: {e}")
            
    print("\nProcesso concluído com sucesso!")

if __name__ == "__main__":
    TURMAS = {
        "1": {"nome": "English for Love", "id": "797484606252", "nivel": "B1 (Intermediate)", "foco": "Inglês do dia-a-dia, situações reais de viagens, conversação geral e cultura"},
        "2": {"nome": "Open Class", "id": "797484587421", "nivel": "Mixed Level (Misto)", "foco": "Temas de atualidades, debates, vocabulário de notícias e argumentação"},
        "3": {"nome": "IELTS", "id": "797484527558", "nivel": "A1 (Beginner/Elementary)", "foco": "Preparação para a prova de visto, rotinas diárias morando no Canadá e sobrevivência inicial no exterior"},
        "4": {"nome": "English for IT", "id": "797484553050", "nivel": "A2/B1 (Pre-Intermediate to Intermediate)", "foco": "Inglês corporativo focado em TI, infraestrutura de Telecomunicações, Telefonia IP, ITSM e Contact Center"},
        "5": {"nome": "Next Level", "id": "797484594828", "nivel": "A2 (Pre-Intermediate)", "foco": "Inglês corporativo voltado para o mercado financeiro, Finanças, Banking e Investimentos de longo prazo"}
    }
    
    print("=== SELECIONE A TURMA PARA A QUAL DESEJA GERAR MATERIAL ===")
    for chave, info in TURMAS.items():
        print(f"[{chave}] {info['nome']} (Nível: {info['nivel']})")
    
    opcao = input("\nDigite o número da turma (1 a 5): ").strip()
    if opcao in TURMAS:
        turma_selecionada = TURMAS[opcao]
        tema = input(f"\nDigite o tema geral para a aula desta turma: ").strip()
        rodar_fluxo_automacao(turma_selecionada, tema)
    else:
        print("[X] Opção inválida. Execução encerrada.")