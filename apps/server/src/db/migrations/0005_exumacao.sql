ALTER TABLE `sepultamentos` ADD `exumado_em` text;--> statement-breakpoint
ALTER TABLE `sepultamentos` ADD `exumacao_destino` text;--> statement-breakpoint
ALTER TABLE `sepultamentos` ADD `exumacao_sepultura_destino_id` integer;--> statement-breakpoint
ALTER TABLE `sepultamentos` ADD `exumacao_observacao` text;--> statement-breakpoint
ALTER TABLE `sepultamentos` ADD `exumacao_registrada_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `sepultamentos` ADD `transferido_de_id` integer;