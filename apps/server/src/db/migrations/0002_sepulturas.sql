CREATE TABLE `sepultamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sepultura_id` integer NOT NULL,
	`nome_sepultado` text NOT NULL,
	`nome_normalizado` text NOT NULL,
	`socio_id` integer,
	`socio_direito_id` integer,
	`parentesco` text,
	`data_nascimento` text,
	`data_falecimento` text,
	`data_sepultamento` text NOT NULL,
	`certidao_obito` text,
	`observacoes` text,
	`historico` integer DEFAULT false NOT NULL,
	`justificativa_excecao` text,
	`efeitos` text,
	`registrado_por` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sepultura_id`) REFERENCES `sepulturas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`socio_direito_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sepultamentos_sepultura_idx` ON `sepultamentos` (`sepultura_id`);--> statement-breakpoint
CREATE INDEX `sepultamentos_nome_idx` ON `sepultamentos` (`nome_normalizado`);--> statement-breakpoint
CREATE TABLE `sepultura_fotos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sepultura_id` integer NOT NULL,
	`arquivo` text NOT NULL,
	`miniatura` text NOT NULL,
	`legenda` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sepultura_id`) REFERENCES `sepulturas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sepultura_fotos_sepultura_idx` ON `sepultura_fotos` (`sepultura_id`);--> statement-breakpoint
CREATE TABLE `sepultura_titulares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sepultura_id` integer NOT NULL,
	`socio_id` integer NOT NULL,
	`inicio` text NOT NULL,
	`fim` text,
	`motivo` text NOT NULL,
	`observacao` text,
	FOREIGN KEY (`sepultura_id`) REFERENCES `sepulturas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sepultura_titulares_sepultura_idx` ON `sepultura_titulares` (`sepultura_id`);--> statement-breakpoint
CREATE TABLE `sepulturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`socio_id` integer,
	`tipo` text DEFAULT 'cova' NOT NULL,
	`capacidade` integer DEFAULT 1 NOT NULL,
	`situacao` text DEFAULT 'disponivel' NOT NULL,
	`referencia` text,
	`data_aquisicao` text,
	`latitude` real,
	`longitude` real,
	`observacoes` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sepulturas_codigo_unique` ON `sepulturas` (`codigo`);--> statement-breakpoint
CREATE INDEX `sepulturas_socio_idx` ON `sepulturas` (`socio_id`);--> statement-breakpoint
CREATE TABLE `sucessoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_origem_id` integer NOT NULL,
	`socio_destino_id` integer NOT NULL,
	`cobranca_taxa_id` integer,
	`situacao` text DEFAULT 'pendente' NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`concluida_em` text,
	FOREIGN KEY (`socio_origem_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`socio_destino_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cobranca_taxa_id`) REFERENCES `cobrancas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
