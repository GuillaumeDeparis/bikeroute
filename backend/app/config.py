"""Réglages applicatifs centralisés, lus depuis l'environnement.

Regroupe les valeurs qui doivent rester ajustables sans toucher au code
(durée de session, longueurs du mot de passe, DSN PostgreSQL, ...).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL - jamais de valeur en dur en production, cf. NFR-1.
    # Le défaut ci-dessous cible le port publié par `docker-compose.yml`
    # (5433 sur l'hôte, pour ne pas entrer en conflit avec un PostgreSQL
    # local déjà présent sur le 5432) ; le service `api` du compose
    # surcharge cette variable pour joindre `db:5432` sur le réseau Docker.
    database_url: str = "postgresql+psycopg://bikeroute:bikeroute@localhost:5433/bikeroute"

    # Durée de vie d'une session (non glissante), en jours.
    session_duration_days: int = 14

    # Nom du cookie de session.
    session_cookie_name: str = "session_id"

    # Politique de mot de passe (point de départ documenté dans les Design
    # Notes de la spec, ajustable sans redéploiement de code).
    password_min_length: int = 10
    password_max_length: int = 128

    # Coût du hachage Argon2id, exposé ici plutôt que codé en dur dans
    # `services/accounts.py` (convention du projet : les réglages vivent
    # dans `config.py`). Valeurs par défaut = défauts actuels d'argon2-cffi.
    argon2_time_cost: int = 3
    argon2_memory_cost: int = 65536
    argon2_parallelism: int = 4
    argon2_hash_len: int = 32
    argon2_salt_len: int = 16

    # Limitation de débit sur /login et /register (par IP + identifiant),
    # fenêtre glissante en mémoire -- cf. `services/rate_limiting.py`.
    login_rate_limit_max_attempts: int = 10
    login_rate_limit_window_seconds: float = 60.0
    register_rate_limit_max_attempts: int = 10
    register_rate_limit_window_seconds: float = 60.0

    @model_validator(mode="after")
    def _validate_bounds(self) -> Self:
        if self.password_min_length > self.password_max_length:
            raise ValueError("password_min_length doit être inférieur ou égal à password_max_length.")
        if self.session_duration_days <= 0:
            raise ValueError("session_duration_days doit être strictement positif.")
        for field in (
            "argon2_time_cost",
            "argon2_memory_cost",
            "argon2_parallelism",
            "argon2_hash_len",
            "argon2_salt_len",
        ):
            if getattr(self, field) <= 0:
                raise ValueError(f"{field} doit être strictement positif.")
        for field in (
            "login_rate_limit_max_attempts",
            "login_rate_limit_window_seconds",
            "register_rate_limit_max_attempts",
            "register_rate_limit_window_seconds",
        ):
            if getattr(self, field) <= 0:
                raise ValueError(f"{field} doit être strictement positif.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
