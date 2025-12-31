{
  description = "Gullak - AI-powered expense tracker with ledger-cli integration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            python313
            uv
            ledger
            
            just
            git
          ];

          shellHook = ''
            echo "🪙 Gullak Dev Environment"
            echo ""
            echo "  Python:  $(python --version)"
            echo "  uv:      $(uv --version)"
            echo "  Ledger:  $(ledger --version | head -1)"
            echo ""
            echo "Commands:"
            echo "  just dev    - Start dev server"
            echo "  just test   - Run tests"
            echo "  just fmt    - Format code"
            echo ""
          '';

          PYTHONDONTWRITEBYTECODE = "1";
          UV_LINK_MODE = "copy";
        };
      }
    );
}
