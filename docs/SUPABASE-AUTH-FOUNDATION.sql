-- Fondation Supabase Auth multi-evenements.
-- Executez ce script avant d'utiliser la nouvelle connexion email/mot de passe.
-- Il n'active PAS encore les politiques RLS strictes pour les donnees metier :
-- les parcours invites doivent d'abord etre deplaces vers des fonctions RPC tokenisees.

CREATE TABLE IF NOT EXISTS public.profiles (
	id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'platform')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	INSERT INTO public.profiles (id)
	VALUES (NEW.id)
	ON CONFLICT (id) DO NOTHING;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
	AFTER INSERT ON auth.users
	FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();

-- Cree les profils des comptes Auth qui existaient avant cette migration.
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.events
	ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_read_own" ON public.profiles
	FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
	FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role = 'client');

-- APRES avoir cree votre compte dans Authentication > Users, executez une seule fois :
-- UPDATE public.profiles
-- SET role = 'platform'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'votre-email@exemple.com');
--
-- Associez ensuite les evenements existants a leur organisateur :
-- UPDATE public.events
-- SET owner_id = (SELECT id FROM auth.users WHERE email = 'client@exemple.com')
-- WHERE id = 'yanick-keren';