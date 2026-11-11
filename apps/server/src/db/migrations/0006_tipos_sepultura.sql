-- Tipos de sepultura simplificados: Túmulo, Ossuário, Gaveta e Outro.
-- "Jazigo" e "Cova" passam a ser "Túmulo".
-- O valor padrão da coluna no banco continua 'cova' de propósito: mudar o padrão no SQLite exige
-- recriar a tabela (arriscado com as tabelas ligadas a ela), e o sistema sempre informa o tipo ao gravar.
UPDATE `sepulturas` SET `tipo` = 'tumulo' WHERE `tipo` IN ('jazigo', 'cova');
