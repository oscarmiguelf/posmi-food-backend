import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { BrandSchema, BrandConfig } from '../domain/schemas/brand.schema';
import { ThemeSchema, ThemeConfig } from '../domain/schemas/theme.schema';
import { CopiesSchema, CopiesConfig } from '../domain/schemas/copies.schema';
import { ModulesSchema, ModulesConfig } from '../domain/schemas/modules.schema';

const DEFAULTS: {
  brand: BrandConfig;
  theme: ThemeConfig;
  copies: CopiesConfig;
  modules: ModulesConfig;
} = {
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
    modules: {
      reservations: true,
      loyalty: true,
      purchasing: true,
      purchaseSuggestions: false,
    },
  },
};

@Injectable()
export class WhiteLabelService implements OnModuleInit {
  private readonly logger = new Logger(WhiteLabelService.name);
  private brand: BrandConfig = DEFAULTS.brand;
  private theme: ThemeConfig = DEFAULTS.theme;
  private copies: CopiesConfig = DEFAULTS.copies;
  private modules: ModulesConfig = DEFAULTS.modules;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const clientName = this.config.get<string>('CLIENT_NAME', 'default');
    const configDir = path.resolve(
      process.cwd(),
      'config',
      'clients',
      clientName,
    );

    this.brand = this.load(
      'brand.json',
      BrandSchema,
      DEFAULTS.brand,
      configDir,
    );
    this.theme = this.load(
      'theme.json',
      ThemeSchema,
      DEFAULTS.theme,
      configDir,
    );
    this.copies = this.load(
      'copies.json',
      CopiesSchema,
      DEFAULTS.copies,
      configDir,
    );
    this.modules = this.load(
      'modules.json',
      ModulesSchema,
      DEFAULTS.modules,
      configDir,
    );

    this.logger.log(
      `White-label config loaded — client="${clientName}", modules=${JSON.stringify(this.modules.modules)}`,
    );
  }

  getConfig() {
    return {
      brand: this.brand,
      theme: this.theme,
      copies: this.copies,
      modules: this.modules.modules,
    };
  }

  isModuleEnabled(module: keyof ModulesConfig['modules']): boolean {
    return this.modules.modules[module] ?? false;
  }

  /** Deep-merge client overrides on top of defaults, then validate. */
  private load<T>(
    filename: string,
    schema: { parse: (v: unknown) => T },
    defaults: T,
    dir: string,
  ): T {
    const filepath = path.join(dir, filename);

    if (!fs.existsSync(filepath)) {
      return defaults;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
      this.logger.error(`Cannot parse ${filepath} — falling back to defaults`);
      return defaults;
    }

    // Deep-merge: client file on top of defaults
    const merged = deepMerge(
      defaults as Record<string, unknown>,
      raw as Record<string, unknown>,
    );

    try {
      return schema.parse(merged);
    } catch (err) {
      // Hard fail on startup — invalid config must never reach production
      const msg = `Invalid ${filename} for client "${dir}": ${String(err)}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
  }
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}
