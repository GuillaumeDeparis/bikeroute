from __future__ import annotations

from app.route_engine.bootstrap import elevation


def test_shutdown_elevation_provider_ferme_le_client_et_vide_le_cache(monkeypatch) -> None:
    instances = []

    class FakeProvider:
        def __init__(self, **kwargs) -> None:
            self.closed = False
            instances.append(self)

        def close(self) -> None:
            self.closed = True

    elevation.shutdown_elevation_provider()
    monkeypatch.setattr(elevation, "ValhallaElevationProvider", FakeProvider)

    premier = elevation.get_elevation_provider()
    assert elevation.get_elevation_provider() is premier

    elevation.shutdown_elevation_provider()
    second = elevation.get_elevation_provider()

    assert premier.closed is True
    assert second is not premier
    elevation.shutdown_elevation_provider()
