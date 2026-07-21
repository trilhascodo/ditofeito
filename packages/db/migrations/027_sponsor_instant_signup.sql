-- ============================================================================
-- MIGRAÇÃO 027 — CONTA DE ANUNCIANTE VIRA INSTANTÂNEA
-- A fila de aprovação de sponsor_applications (026) atrasava sem acrescentar
-- segurança nenhuma: nada fica público sem passar pela aprovação de campanha
-- (sponsorships.approval_status) ou de arte (sponsors.creative_review_status),
-- que continuam existindo. Revisar a CONTA em si só duplicava esse controle e
-- quebrava a promessa de autoatendimento ("aplique sem esperar retorno da
-- equipe" virava mentira na prática). sponsor.becomeSponsor substitui o
-- create+approve por uma transação só, sem fila.
-- ============================================================================

DROP TABLE sponsor_applications;
