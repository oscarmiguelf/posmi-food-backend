import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

// Default brand/theme/copies/modules — overridden per-client via config files (section 3.5)
const DEFAULT_CONFIG = {
  brand: {
    companyName: 'PosmiFood',
    productDisplayName: 'PosmiFood POS',
    logo: {
      full: '/assets/logo.png',
      icon: '/assets/icon.png',
      darkVariant: null,
    },
  },
  theme: {
    colors: {
      primary: '#1B4F72',
      secondary: '#2E86C1',
      danger: '#C0392B',
      success: '#1E8449',
      warning: '#B7770D',
      background: '#F4F6F7',
      textPrimary: '#1C2833',
    },
  },
  copies: {
    locale: 'es-MX',
    strings: {
      'tables.title': 'Mesas',
      'orders.addItem': 'Agregar producto',
      'orders.close': 'Cobrar',
      'orders.status.open': 'Abierta',
      'orders.status.in_kitchen': 'En cocina',
      'orders.status.ready': 'Lista',
      'orders.status.closed': 'Cerrada',
    },
  },
  modules: {
    reservations: true,
    loyalty: true,
    purchasing: true,
    purchaseSuggestions: false,
  },
};

@ApiTags('config')
@Controller('config')
export class ConfigController {
  @Get()
  getConfig() {
    return DEFAULT_CONFIG;
  }
}
