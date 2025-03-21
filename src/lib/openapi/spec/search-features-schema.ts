import { FromSchema } from 'json-schema-to-ts';
import { parametersSchema } from './parameters-schema';
import { variantSchema } from './variant-schema';
import { overrideSchema } from './override-schema';
import { featureStrategySchema } from './feature-strategy-schema';
import { featureSchema } from './feature-schema';
import { constraintSchema } from './constraint-schema';
import { featureEnvironmentSchema } from './feature-environment-schema';
import { strategyVariantSchema } from './strategy-variant-schema';
import { tagSchema } from './tag-schema';

export const searchFeaturesSchema = {
    $id: '#/components/schemas/searchFeaturesSchema',
    type: 'object',
    additionalProperties: false,
    required: ['features'],
    description: 'A list of features matching search and filter criteria.',
    properties: {
        features: {
            type: 'array',
            items: {
                $ref: '#/components/schemas/featureSchema',
            },
            description:
                'The full list of features in this project (excluding archived features)',
        },
        total: {
            type: 'number',
            description:
                'Total count of the features matching search and filter criteria',
            example: 10,
        },
    },
    components: {
        schemas: {
            featureSchema,
            constraintSchema,
            featureEnvironmentSchema,
            featureStrategySchema,
            strategyVariantSchema,
            overrideSchema,
            parametersSchema,
            variantSchema,
            tagSchema,
        },
    },
} as const;

export type SearchFeaturesSchema = FromSchema<typeof searchFeaturesSchema>;
