import { Injectable, Logger } from '@nestjs/common';

/**
 * GreetingFlow
 * Handles greeting messages and provides menu options
 */
@Injectable()
export class GreetingFlow {
  private readonly logger = new Logger(GreetingFlow.name);

  /**
   * Generate greeting response with menu
   *
   * @param customerName - Customer name (optional)
   * @returns Greeting message with options
   */
  async handle(customerName?: string): Promise<string> {
    const greeting = customerName ? `¡Hola ${customerName}!` : '¡Hola!';

    const message = `${greeting} 👋

Bienvenido/a a nuestra tienda. ¿En qué puedo ayudarte hoy?

🔍 Para buscar productos, escribe lo que necesitas
   Ejemplo: "busco zapatillas running"

❓ Escribe "ayuda" para ver más opciones

¿Qué te gustaría hacer?`;

    this.logger.debug('Generated greeting response');
    return message;
  }
}
