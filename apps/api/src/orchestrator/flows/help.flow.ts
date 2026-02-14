import { Injectable, Logger } from '@nestjs/common';

/**
 * HelpFlow
 * Provides help information and available commands
 */
@Injectable()
export class HelpFlow {
  private readonly logger = new Logger(HelpFlow.name);

  /**
   * Generate help message with available options
   *
   * @returns Help message
   */
  async handle(): Promise<string> {
    const message = `📋 *Opciones disponibles*

🔍 *Buscar productos*
Simplemente escribe lo que buscas
Ejemplo: "busco zapatillas", "tienes camisas azules"

❓ *Ayuda*
Escribe "ayuda" o "menú" para ver estas opciones

💬 *Hablar con un humano*
Escribe "hablar con agente" o "ayuda humana"

---

¿En qué puedo ayudarte?`;

    this.logger.debug('Generated help response');
    return message;
  }
}
