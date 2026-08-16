import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagRepository } from './rag.repository';

@Injectable()
export class RagSeederService implements OnModuleInit {
  private readonly logger = new Logger(RagSeederService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly ragRepository: RagRepository,
  ) {}

  async onModuleInit() {
    const count = await this.ragRepository.countDocuments();
    
    if (count === 0) {
      this.logger.log('Base de datos vacía. Iniciando inyección de conocimiento por defecto...');
      await this.seedDefaultKnowledge();
      this.logger.log('Conocimiento base inyectado exitosamente. RAG listo.');
    } else {
      this.logger.log(`El RAG ya cuenta con ${count} fragmentos de conocimiento en memoria.`);
    }
  }

  private async seedDefaultKnowledge() {
    // Acá se define la base de conocimiento inicial. 
    // Cada string del array será procesado, vectorizado y guardado.
    const defaultKnowledge = [
        // 1. Horarios y Logística Principal (Lo más preguntado)
        "El horario de Check-in en el hotel es a partir de las 13:00 horas. El horario de Check-out es hasta las 11:00 horas.",
        "El hotel ofrece servicio de Late Check-out sujeto a disponibilidad. Extender la estadía hasta las 14:00 horas tiene un costo adicional del 30% de la tarifa diaria. Extenderla hasta las 18:00 horas tiene un costo del 50%.",
        "La recepción del hotel está abierta las 24 horas del día, los 7 días de la semana, con personal bilingüe (español e inglés) para asistencia continua.",

        // 2. Desayuno y Gastronomía
        "El desayuno buffet está incluido en todas las tarifas. Se sirve de lunes a viernes de 07:00 a 10:00 horas, y los fines de semana y feriados de 07:30 a 11:00 horas en el salón de la planta baja.",
        "El hotel cuenta con un restaurante a la carta abierto para almuerzos y cenas de 12:30 a 23:00 horas. Ofrecemos menú infantil, opciones celíacas y vegetarianas bajo petición.",
        "El servicio de habitaciones (Room Service) funciona las 24 horas. El menú nocturno (de 23:00 a 06:00) está limitado a sándwiches, ensaladas y bebidas frías.",

        // 3. Servicios e Instalaciones
        "La red Wi-Fi del hotel es gratuita en todas las habitaciones y áreas comunes. La red se llama 'Hotel_Guest' y la contraseña actual es 'Bienvenidos2026'.",
        "El hotel cuenta con estacionamiento subterráneo privado y gratuito para todos los huéspedes. No es necesario reservar plaza con antelación.",
        "Las instalaciones incluyen una piscina climatizada y un gimnasio, ambos ubicados en el planta baja. El horario de uso de ambas instalaciones es de 08:00 a 22:00 horas.",

        // 4. Políticas del Hotel
        "El hotel tiene una estricta política de 'No Fumar' en todas las habitaciones y pasillos. Fumar en áreas no permitidas conlleva una multa de limpieza de 150 dólares.",
        "Política de mascotas: Somos un hotel Pet Friendly. Se acepta una mascota de tamaño pequeño o mediano (hasta 15 kg) por habitación, con un cargo adicional de 20 dólares por noche. Las mascotas no pueden ingresar al área del restaurante ni a la piscina.",
        "Las políticas de cancelación estándar permiten cancelar sin costo hasta 48 horas antes de la fecha de llegada. Pasado ese límite, se cobrará la primera noche como penalidad.",

        // 5. Ubicación y Transporte
        "El hotel se encuentra en el centro de la ciudad, a 4 cuadras de la plaza principal y a 10 minutos caminando de la zona comercial y gastronómica.",
        "El hotel ofrece servicio de traslado (transfer) desde y hacia el aeropuerto internacional. Este servicio tiene un costo de 35 dólares y debe reservarse en recepción con al menos 24 horas de anticipación."
    ];

    for (const text of defaultKnowledge) {
      await this.ragService.ingestDocument(text);
    }
  }
}