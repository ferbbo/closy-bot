import { Injectable, Logger } from '@nestjs/common';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * GreetingFlow
 * Handles greeting messages and provides menu options
 * PR-11: Now uses playbook messages for personalized greetings
 */
@Injectable()
export class GreetingFlow {
  private readonly logger = new Logger(GreetingFlow.name);

  constructor(private readonly playbookService: PlaybookService) {}

  /**
   * Generate greeting response with menu
   * PR-11: Uses playbook greeting message if merchant provided
   *
   * @param customerName - Customer name (optional)
   * @param merchant - Merchant data with playbook (optional, PR-11)
   * @returns Greeting message with options
   */
  async handle(customerName?: string, merchant?: MerchantPlaybookData): Promise<string> {
    let greeting: string;

    // PR-11: Use playbook greeting if merchant provided
    if (merchant) {
      greeting = this.playbookService.getGreetingMessage(merchant);

      // Add customer name if provided
      if (customerName) {
        greeting = greeting.replace('¡Hola!', `¡Hola ${customerName}!`);
      }
    } else {
      // Fallback to generic greeting
      greeting = customerName ? `¡Hola ${customerName}!` : '¡Hola!';
    }

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
