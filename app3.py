import os
import re
import wave
import time
import random

from google import genai
from google.genai import types
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.cloud import texttospeech

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# =====================================================================
# CONFIGURAÇÕES E DESIGN
# =====================================================================
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "gcp_key.json"
os.environ["GEMINI_API_KEY"] = "AQ.Ab8RN6LbtmkBsa3qfeiv6DK_YnTRS9ITTA7lP82acwvaXyKpSw"

SCOPES = [
    'https://www.googleapis.com/auth/classroom.coursework.students', 
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/drive.file'
]

VOZES_MASCULINAS = [{"language_code": "en-US", "name": "en-US-Journey-D"}]
VOZES_FEMININAS = [{"language_code": "en-US", "name": "en-US-Journey-F"}]

# =====================================================================
# FUNÇÕES CORE
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

def gerar_audio_dialogo_gcp(texto_dialogo, nome_arquivo):
    client = texttospeech.TextToSpeechClient()
    voz_homem = random.choice(VOZES_MASCULINAS)
    voz_mulher = random.choice(VOZES_FEMININAS)
    linhas = texto_dialogo.strip().split('\n')
    arquivos_temporarios = []
    
    try:
        for i, linha in enumerate(linhas):
            if not linha.strip(): continue
            voz = voz_homem if '(MALE):' in linha.upper() else voz_mulher
            texto = linha.split(':', 1)[1].strip() if ':' in linha else linha
            synthesis_input = texttospeech.SynthesisInput(text=texto)
            voice = texttospeech.VoiceSelectionParams(language_code=voz["language_code"], name=voz["name"])
            audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.LINEAR16, sample_rate_hertz=24000)
            response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
            
            temp = f"temp_{i}.wav"
            with open(temp, "wb") as out: out.write(response.audio_content)
            arquivos_temporarios.append(temp)

        with wave.open(arquivos_temporarios[0], 'rb') as w_in:
            with wave.open(nome_arquivo, 'wb') as w_out:
                w_out.setparams(w_in.getparams())
                for t in arquivos_temporarios:
                    with wave.open(t, 'rb') as w: w_out.writeframes(w.readframes(w.getnframes()))
    finally:
        for t in arquivos_temporarios:
            if os.path.exists(t): os.remove(t)
    return nome_arquivo

def upload_para_drive(service, nome, mime):
    return service.files().create(body={'name': nome, 'mimeType': mime}, media_body=MediaFileUpload(nome, mimetype=mime), fields='id').execute().get('id')

def limpar_tags_dinamicas(texto):
    texto = re.sub(r'\s*\(MALE\)\s*:', ':', texto, flags=re.IGNORECASE)
    texto = re.sub(r'\s*\(FEMALE\)\s*:', ':', texto, flags=re.IGNORECASE)
    return re.sub(r'<[^>]+>', '', texto)

def limpar_markdown(texto):
    """Remove formatação Markdown para que o Classroom exiba texto limpo."""
    texto = re.sub(r'^#{1,6}\s+', '', texto, flags=re.MULTILINE)
    texto = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', texto)
    texto = re.sub(r'\*\*(.+?)\*\*', r'\1', texto)
    texto = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'\1', texto)
    texto = re.sub(r'___(.+?)___', r'\1', texto)
    texto = re.sub(r'__(.+?)__', r'\1', texto)
    texto = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'\1', texto)
    texto = re.sub(r'`(.+?)`', r'\1', texto)
    return texto

def gerar_pdf_didatico(info_turma, tema, secoes, nome_pdf):
    doc = SimpleDocTemplate(nome_pdf, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    PRIMARY_COLOR = colors.HexColor("#0F2C59")
    TEXT_COLOR = colors.HexColor("#1A1A1A")
    
    title_style = ParagraphStyle('OxfordTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=24, leading=28, textColor=PRIMARY_COLOR, spaceAfter=6)
    subtitle_style = ParagraphStyle('OxfordSubtitle', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=10, leading=14, textColor=colors.HexColor("#555555"), spaceAfter=20)
    h2_style = ParagraphStyle('OxfordH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=PRIMARY_COLOR, spaceBefore=15, spaceAfter=10)
    body_style = ParagraphStyle('OxfordBody', parent=styles['Normal'], fontName='Helvetica', fontSize=11, leading=16, textColor=TEXT_COLOR, spaceAfter=10)
    
    story = []
    story.append(Paragraph(f"UNIT MATERIAL: {tema.upper()}", title_style))
    story.append(Paragraph(f"Course: {info_turma['nome']} | Level: {info_turma['nivel']}", subtitle_style))
    
    # Reading
    story.append(Paragraph("PART 1: READING COMPREHENSION", h2_style))
    partes_reading = secoes['reading'].strip().split('GLOSSARY:')
    for p in partes_reading[0].strip().split('\n'):
        if p.strip(): story.append(Paragraph(p.strip(), body_style))
            
    if len(partes_reading) > 1:
        story.append(Spacer(1, 15))
        story.append(Paragraph("GLOSSARY", h2_style))
        for item in partes_reading[1].strip().split('\n'):
            if item.strip(): story.append(Paragraph(f"• {item.strip()}", body_style))
                
    story.append(PageBreak())
    
    # Listening
    story.append(Paragraph("PART 2: LISTENING PRACTICE", h2_style))
    story.append(Paragraph("Listen to the audio track attached in your Classroom and follow the script below:", subtitle_style))
    for linha in limpar_tags_dinamicas(secoes['listening']).split('\n'):
        if linha.strip(): story.append(Paragraph(linha.strip(), body_style))
            
    story.append(PageBreak())

    # Grammar
    story.append(Paragraph("PART 3: GRAMMAR FOCUS & PRACTICE", h2_style))
    for linha in secoes['grammar'].split('\n'):
        if midline := linha.strip(): story.append(Paragraph(midline, body_style))

    story.append(Spacer(1, 20))

    # Writing
    story.append(Paragraph("PART 4: WRITING CHALLENGE", h2_style))
    for linha in secoes['writing'].split('\n'):
        if midline := linha.strip(): story.append(Paragraph(midline, body_style))
            
    doc.build(story)
    return nome_pdf

def obter_ids_topicos(service, course_id):
    resposta = service.courses().topics().list(courseId=course_id).execute()
    topicos_existentes = resposta.get('topic', [])
    mapa_topicos = {t['name'].strip().lower(): t['topicId'] for t in topicos_existentes}
    ids_finais = {}
    for padrao in ['reading', 'listening', 'grammar', 'writing']:
        if padrao in mapa_topicos:
            ids_finais[padrao] = mapa_topicos[padrao]
        else:
            novo = service.courses().topics().create(courseId=course_id, body={'name': padrao.capitalize()}).execute()
            ids_finais[padrao] = novo['topicId']
    return ids_finais

# =====================================================================
# MOTOR DE AUTOMAÇÃO
# =====================================================================

def rodar_fluxo_automacao(info_turma, tema):
    print(f"\n[1/4] Solicitando ao Gemini a geração do material para: {info_turma['nome']}...")
    ai_client = genai.Client()
    
    system_instruction = (
        f"Você é um professor nativo de inglês especialista em metodologia personalizada.\n"
        f"Gere um kit de aula adaptado EXATAMENTE ao seguinte perfil de aluno:\n"
        f"- Nível de Proficiência: {info_turma['nivel']}\n"
        f"- Objetivo e Foco Temático: {info_turma['foco']}\n\n"
        f"REGRA OBRIGATÓRIA DE SEPARAÇÃO:\n"
        f"Você deve dividir a sua resposta usando EXATAMENTE as quatro tags abaixo em letras maiúsculas e entre colchetes.\n\n"
        f"[READING]\n"
        f"Crie um texto original sobre o tema (250 a 300 palavras). Adicione um 'GLOSSARY' no final com no mínimo 20 palavras traduzidas.\n\n"
        f"[LISTENING]\n"
        f"Escreva o roteiro de um DIÁLOGO dinâmico (250 a 300 palavras). Formato obrigatório: Nome (MALE): fala / Nome (FEMALE): fala.\n"
        f"Use PONTUAÇÃO para ditar o ritmo: reticências (...) para pausas, exclamações (!) para entusiasmo. Use fillers ('Well...', 'gonna').\n\n"
        f"[GRAMMAR]\n"
        f"Escolha 1 tópico gramatical relevante para o nível {info_turma['nivel']} e foco em {info_turma['foco']}.\n"
        f"Faça uma explicação teórica direta e clara (máximo 100 palavras) e crie 5 exercícios de 'fill-in-the-blanks' com gabarito no final.\n\n"
        f"[WRITING]\n"
        f"Adicione 3 perguntas de compreensão sobre o áudio. Em seguida, crie um desafio prático de escrita (60 a 100 palavras) com 'Useful Phrases' e exemplo de resposta.\n\n"

        f"MUITO IMPORTANTE: Entregue TEXTO PURO. NÃO use formatação Markdown (nunca use asteriscos ** para negrito ou hashtags #). "
        f"Use apenas letras MAIÚSCULAS para destacar títulos e pule linhas para manter o visual limpo."
    )
    
    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=f"Tema da aula solicitado: {tema}",
        config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.2)
    )
    conteudo_gerado = response.text

    # Parse estruturado das seções
    secoes = {"reading": "", "listening": "", "grammar": "", "writing": ""}
    secao_atual = None
    for linha in conteudo_gerado.split('\n'):
        linha_limpa = linha.strip().upper()
        if "[READING]" in linha_limpa: secao_atual = "reading"; continue
        elif "[LISTENING]" in linha_limpa: secao_atual = "listening"; continue
        elif "[GRAMMAR]" in linha_limpa: secao_atual = "grammar"; continue
        elif "[WRITING]" in linha_limpa: secao_atual = "writing"; continue

        
        if secao_atual: secoes[secao_atual] += linha + "\n"

    print("\n=====================================================================")
    print("                      CONTEÚDO GERADO PARA REVISÃO                   ")
    print("=====================================================================")
    for nome_secao in ['reading', 'listening', 'grammar', 'writing']:
        print(f"\n--- [{nome_secao.upper()}] ---")
        print(limpar_tags_dinamicas(secoes[nome_secao].strip()))
    print("\n=====================================================================")
    
    confirmacao = input("\nVocê aprova o material gerado? Digite 'sim' para continuar ou 'nao' para cancelar: ").strip().lower()
    if confirmacao != 'sim': return

    print("\n[2/4] Autenticando com Google e mapeando tópicos...")
    creds = autenticar_google()
    classroom_service = build('classroom', 'v1', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)
    ids_topicos = obter_ids_topicos(classroom_service, info_turma['id'])
    
    # 1. Gerar e Subir PDF
    print("\n[*] Diagramando Livro Didático Digital em PDF (Padrão Oxford)...")
    nome_pdf_local = f"{tema.replace(' ', '_')}_Workbook.pdf"
    gerar_pdf_didatico(info_turma, tema, secoes, nome_pdf=nome_pdf_local)
    pdf_drive_id = upload_para_drive(drive_service, nome_pdf_local, 'application/pdf')
    os.remove(nome_pdf_local)

    # 2. Gerar e Subir Áudio
    audio_drive_id = None
    if secoes['listening'].strip():
        print("\n[3/4] Gravando o diálogo na nuvem do Google Cloud TTS (Voz Journey)...")
        try:
            nome_customizado = f"{tema.replace(' ', '_')}_Audio.wav"
            nome_wav = gerar_audio_dialogo_gcp(secoes['listening'].strip(), nome_arquivo=nome_customizado)
            if nome_wav:
                audio_drive_id = upload_para_drive(drive_service, nome_wav, 'audio/wav')
                os.remove(nome_wav)
        except Exception as e:
            print(f"[!] Erro no áudio: {e}")

    # 3. Postar as fatias organizadas no Classroom
    print("\n[4/4] Enviando fatias para o Classroom...")
    for habilidade in ['reading', 'listening', 'grammar', 'writing']:
        texto_habilidade = secoes[habilidade].strip()
        if not texto_habilidade: continue
            
        texto_habilidade = limpar_markdown(texto_habilidade)
        if habilidade == 'listening': texto_habilidade = limpar_tags_dinamicas(texto_habilidade)
            
        tarefa_body = {
            'title': f"Unit Material: {tema} - {habilidade.capitalize()}",
            'description': texto_habilidade,
            'workType': 'ASSIGNMENT', 'state': 'PUBLISHED', 'topicId': ids_topicos[habilidade]
        }
        
        materiais = []
        if habilidade in ['reading', 'grammar'] and pdf_drive_id:
            materiais.append({'driveFile': {'driveFile': {'id': pdf_drive_id}, 'shareMode': 'VIEW'}})
        if habilidade == 'listening' and audio_drive_id:
            materiais.append({'driveFile': {'driveFile': {'id': audio_drive_id}, 'shareMode': 'VIEW'}})

            
        if materiais: 
            tarefa_body['materials'] = materiais
            if habilidade in ['reading', 'grammar']:
                tarefa_body['description'] = "DOWNLOAD YOUR ATTACHED MATERIALS BELOW.\n\n" + tarefa_body['description']
        
        try:
            classroom_service.courses().courseWork().create(courseId=info_turma['id'], body=tarefa_body).execute()
            print(f"[✓] Postado com sucesso: {habilidade.capitalize()}")
        except Exception as e:
            print(f"[X] Erro ao postar {habilidade.capitalize()}: {e}")
            
    print("\nProcesso concluído com sucesso!")

# =====================================================================
# INTERFACE DE SELEÇÃO NO TERMINAL
# =====================================================================
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
        tema_aula = input(f"\nDigite o tema geral para a aula desta turma: ").strip()
        rodar_fluxo_automacao(turma_selecionada, tema_aula)
    else:
        print("[X] Opção inválida. Execução encerrada.")