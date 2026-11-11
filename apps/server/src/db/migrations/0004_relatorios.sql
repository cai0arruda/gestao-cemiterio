CREATE TABLE `avisos_cobranca` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`canal` text DEFAULT 'whatsapp' NOT NULL,
	`usuario_id` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `avisos_socio_idx` ON `avisos_cobranca` (`socio_id`);