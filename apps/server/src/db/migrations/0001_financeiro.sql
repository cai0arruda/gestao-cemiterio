CREATE TABLE `cobrancas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`ano` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`vencimento` text NOT NULL,
	`situacao` text DEFAULT 'aberta' NOT NULL,
	`motivo_cancelamento` text,
	`cancelado_em` text,
	`cancelado_por` integer,
	`sepultura_id` integer,
	`criado_por` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cobrancas_socio_idx` ON `cobrancas` (`socio_id`,`situacao`);--> statement-breakpoint
CREATE UNIQUE INDEX `cobrancas_anuidade_uq` ON `cobrancas` (`socio_id`,`ano`) WHERE tipo = 'anuidade' AND situacao <> 'cancelada';--> statement-breakpoint
CREATE TABLE `pagamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recebimento_id` integer NOT NULL,
	`cobranca_id` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`desconto_centavos` integer DEFAULT 0 NOT NULL,
	`pago_centavos` integer NOT NULL,
	`efeitos` text,
	FOREIGN KEY (`recebimento_id`) REFERENCES `recebimentos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cobranca_id`) REFERENCES `cobrancas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `pagamentos_recebimento_idx` ON `pagamentos` (`recebimento_id`);--> statement-breakpoint
CREATE INDEX `pagamentos_cobranca_idx` ON `pagamentos` (`cobranca_id`);--> statement-breakpoint
CREATE TABLE `recebimentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`ano_recibo` integer,
	`sequencia_recibo` integer,
	`numero_recibo` text,
	`codigo_verificacao` text,
	`data_pagamento` text NOT NULL,
	`forma` text NOT NULL,
	`total_centavos` integer NOT NULL,
	`observacao` text,
	`historico` integer DEFAULT false NOT NULL,
	`vias_impressas` integer DEFAULT 0 NOT NULL,
	`registrado_por` integer,
	`registrado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`estornado_em` text,
	`estornado_por` integer,
	`motivo_estorno` text,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`estornado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recebimentos_numero_recibo_unique` ON `recebimentos` (`numero_recibo`);--> statement-breakpoint
CREATE UNIQUE INDEX `recebimentos_codigo_verificacao_unique` ON `recebimentos` (`codigo_verificacao`);--> statement-breakpoint
CREATE INDEX `recebimentos_socio_idx` ON `recebimentos` (`socio_id`);--> statement-breakpoint
CREATE INDEX `recebimentos_data_idx` ON `recebimentos` (`data_pagamento`);--> statement-breakpoint
CREATE UNIQUE INDEX `recebimentos_recibo_uq` ON `recebimentos` (`ano_recibo`,`sequencia_recibo`);--> statement-breakpoint
CREATE TABLE `tabela_valores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`ano` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`definido_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`definido_por` integer,
	FOREIGN KEY (`definido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tabela_valores_tipo_ano_uq` ON `tabela_valores` (`tipo`,`ano`);