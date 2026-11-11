CREATE TABLE `setores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL,
	`poligono` text NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setores_nome_unique` ON `setores` (`nome`);--> statement-breakpoint
ALTER TABLE `sepulturas` ADD `setor_id` integer;