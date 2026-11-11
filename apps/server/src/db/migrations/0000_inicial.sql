CREATE TABLE `auditoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer,
	`acao` text NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` integer,
	`detalhes` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auditoria_entidade_idx` ON `auditoria` (`entidade`,`entidade_id`);--> statement-breakpoint
CREATE TABLE `configuracoes` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` integer NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ultimo_acesso` text NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessoes_usuario_idx` ON `sessoes` (`usuario_id`);--> statement-breakpoint
CREATE TABLE `socio_documentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`tipo` text DEFAULT 'ficha' NOT NULL,
	`arquivo` text NOT NULL,
	`miniatura` text NOT NULL,
	`legenda` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `socio_documentos_socio_idx` ON `socio_documentos` (`socio_id`);--> statement-breakpoint
CREATE TABLE `socios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricula` text NOT NULL,
	`nome_completo` text NOT NULL,
	`nome_normalizado` text NOT NULL,
	`cpf` text,
	`data_nascimento` text,
	`telefone` text,
	`telefone2` text,
	`email` text,
	`cep` text,
	`logradouro` text,
	`numero` text,
	`complemento` text,
	`bairro` text,
	`cidade` text,
	`uf` text,
	`situacao` text DEFAULT 'ativo' NOT NULL,
	`direito_sepultamento` text DEFAULT 'disponivel' NOT NULL,
	`data_associacao` text,
	`data_falecimento` text,
	`token_publico` text NOT NULL,
	`observacoes` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `socios_matricula_unique` ON `socios` (`matricula`);--> statement-breakpoint
CREATE UNIQUE INDEX `socios_cpf_unique` ON `socios` (`cpf`);--> statement-breakpoint
CREATE UNIQUE INDEX `socios_token_publico_unique` ON `socios` (`token_publico`);--> statement-breakpoint
CREATE INDEX `socios_nome_idx` ON `socios` (`nome_normalizado`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`login` text NOT NULL,
	`senha_hash` text NOT NULL,
	`perfil` text NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`tentativas_falhas` integer DEFAULT 0 NOT NULL,
	`bloqueado_ate` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_login_unique` ON `usuarios` (`login`);