from fastapi import FastAPI
from pydantic import BaseModel
import torch
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
import soundfile as sf
import uuid
import os

app = FastAPI(title="Gerador de Áudios - Aulas de Inglês")
device = "cpu"

print("Carregando o Parler-TTS na RAM... (Isso pode levar 1 minuto na primeira vez)")
model_name = "parler-tts/parler-tts-mini-v1"
model = ParlerTTSForConditionalGeneration.from_pretrained(model_name).to(device)
tokenizer = AutoTokenizer.from_pretrained(model_name)
print("Motor de voz pronto e aguardando automação!")

# Estrutura do "pacote" que sua automação vai enviar para a API
class AudioRequest(BaseModel):
    text: str
    description: str

@app.post("/gerar")
async def gerar_audio(req: AudioRequest):
    print(f"Gerando áudio para: {req.text[:30]}...")
    
    # Processa os textos e a direção de voz
    input_ids = tokenizer(req.description, return_tensors="pt").input_ids.to(device)
    prompt_input_ids = tokenizer(req.text, return_tensors="pt").input_ids.to(device)

    # Roda a geração na CPU
    generation = model.generate(input_ids=input_ids, prompt_input_ids=prompt_input_ids)
    audio_arr = generation.cpu().numpy().squeeze()

    # Cria o arquivo WAV
    nome_arquivo = f"fala_{uuid.uuid4().hex[:6]}.wav"
    caminho_completo = os.path.join(os.getcwd(), nome_arquivo)
    
    sf.write(caminho_completo, audio_arr, model.config.sampling_rate)

    return {
        "status": "sucesso", 
        "mensagem": "Áudio gerado com qualidade de estúdio",
        "arquivo": nome_arquivo
    }