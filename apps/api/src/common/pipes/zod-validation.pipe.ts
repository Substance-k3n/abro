import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Bridges zod schemas from @abro/types into Nest's pipe system. Bind it to
 * the specific parameter it validates — `@Body(new ZodValidationPipe(schema))`
 * — never via `@UsePipes()` at the method level: that applies to every
 * resolved parameter, including custom decorators like @CurrentUser(), and
 * the schema will fail validating whatever else it's handed.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request failed validation.',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
